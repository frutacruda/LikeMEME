import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { scoreImages } from "@/lib/vision/score-images";
import type { ParticipantImage, VisionImage } from "@/lib/vision/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROUTE_WORK_BUDGET_MS = 48_000;
const AUTH_TIMEOUT_MS = 4_000;
const CLAIM_TIMEOUT_MS = 4_000;
const DB_READ_TIMEOUT_MS = 4_000;
const REFERENCE_LOAD_TIMEOUT_MS = 2_000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 6_000;
const COMPLETE_ROUND_TIMEOUT_MS = 4_000;
const INVALIDATE_ROUND_TIMEOUT_MS = 5_000;

type RouteContext = { params: Promise<{ roundId: string }> };
type JudgingStage =
  | "round_query"
  | "submission_query"
  | "reference_load"
  | "storage_download"
  | "gemini_scoring"
  | "score_mapping"
  | "complete_round"
  | "route_deadline";

class JudgingStageError extends Error {
  constructor(
    readonly stage: JudgingStage,
    readonly original: unknown,
  ) {
    super(errorDetails(original).message);
    this.name = "JudgingStageError";
  }
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return {
      name: typeof value.name === "string" ? value.name : undefined,
      message: typeof value.message === "string" ? value.message : "Non-Error object was thrown",
      code: typeof value.code === "string" ? value.code : undefined,
      status: typeof value.status === "number" || typeof value.status === "string" ? value.status : undefined,
      statusCode: typeof value.statusCode === "number" || typeof value.statusCode === "string" ? value.statusCode : undefined,
      details: typeof value.details === "string" ? value.details : undefined,
      hint: typeof value.hint === "string" ? value.hint : undefined,
    };
  }
  return { message: typeof error === "string" ? error : "Unknown thrown value" };
}

function stageError(stage: JudgingStage, error: unknown): never {
  throw new JudgingStageError(stage, error);
}

class OperationTimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`${stage} exceeded its ${timeoutMs}ms time budget.`);
    this.name = "OperationTimeoutError";
  }
}

async function withTimeout<T>(operation: PromiseLike<T>, stage: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(stage, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

async function loadReference(referencePath: string): Promise<VisionImage> {
  if (!/^\/reference-memes\/[a-z0-9-]+\.(?:jpg|png)$/.test(referencePath)) {
    throw new Error("Round reference image path is invalid.");
  }
  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, `.${referencePath}`);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("Round reference image path is invalid.");
  }
  return {
    bytes: new Uint8Array(await readFile(absolutePath)),
    mimeType: referencePath.endsWith(".png") ? "image/png" : "image/jpeg",
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  const routeStartedAt = performance.now();
  const token = bearerToken(request);
  if (!token) {
    console.error("Round judging authentication failed", {
      stage: "bearer_token",
      message: "Authorization bearer token was not provided.",
    });
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { roundId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roundId)) {
    return NextResponse.json({ error: "Invalid round ID." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  let userResult;
  try {
    userResult = await withTimeout(supabase.auth.getUser(token), "jwt_verification", AUTH_TIMEOUT_MS);
  } catch (error) {
    console.error("Round judging authentication failed", {
      roundId,
      stage: "jwt_verification",
      ...errorDetails(error),
    });
    return NextResponse.json({ error: "Could not verify Supabase session." }, { status: 503 });
  }
  const { data: userData, error: userError } = userResult;
  if (userError || !userData.user) {
    console.error("Round judging authentication failed", {
      roundId,
      stage: "jwt_verification",
      ...errorDetails(userError ?? new Error("Authenticated user was not returned.")),
    });
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  let claimResult;
  try {
    claimResult = await withTimeout(
      supabase.rpc("claim_round_judging", {
        target_round_id: roundId,
        requester_user_id: userData.user.id,
      }),
      "claim_round",
      CLAIM_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Round judging claim failed", {
      roundId,
      stage: "claim_round",
      ...errorDetails(error),
    });
    return NextResponse.json({ error: "Could not start judging." }, { status: 503 });
  }
  const { data: claimed, error: claimError } = claimResult;
  if (claimError) {
    console.error("Round judging claim failed", {
      roundId,
      stage: "claim_round",
      ...errorDetails(claimError),
    });
    return NextResponse.json({ error: "Could not start judging." }, { status: 500 });
  }
  if (!claimed) return NextResponse.json({ claimed: false });

  const remainingWorkMs = () => Math.floor(ROUTE_WORK_BUDGET_MS - (performance.now() - routeStartedAt));
  const runStage = async <T>(stage: JudgingStage, timeoutMs: number, operation: () => PromiseLike<T>): Promise<T> => {
    const startedAt = performance.now();
    const availableMs = Math.min(timeoutMs, remainingWorkMs());
    if (availableMs <= 0) stageError("route_deadline", new OperationTimeoutError(stage, 0));
    try {
      const result = await withTimeout(operation(), stage, availableMs);
      console.info("Round judging stage completed", {
        roundId,
        stage,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      console.error("Round judging stage failed", {
        roundId,
        stage,
        elapsedMs: Math.round(performance.now() - startedAt),
        ...errorDetails(error),
      });
      stageError(stage, error);
    }
  };

  try {
    const { data: round, error: roundError } = await runStage(
      "round_query",
      DB_READ_TIMEOUT_MS,
      () => supabase
        .from("rounds")
        .select("reference_image_path")
        .eq("id", roundId)
        .single(),
    );
    if (roundError || !round) stageError("round_query", roundError ?? new Error("Round not found."));

    const { data: submissions, error: submissionsError } = await runStage(
      "submission_query",
      DB_READ_TIMEOUT_MS,
      () => supabase
        .from("round_submissions")
        .select("player_id, storage_object_path, submitted_at")
        .eq("round_id", roundId)
        .order("submitted_at"),
    );
    if (submissionsError || !submissions?.length) {
      stageError("submission_query", submissionsError ?? new Error("Round submissions not found."));
    }

    const reference: VisionImage = await runStage(
      "reference_load",
      REFERENCE_LOAD_TIMEOUT_MS,
      () => loadReference(round.reference_image_path),
    );
    const idToPlayer = new Map<string, string>();
    const participants: ParticipantImage[] = await runStage(
      "storage_download",
      STORAGE_DOWNLOAD_TIMEOUT_MS,
      () => Promise.all(submissions.map(async (submission, index) => {
        const participantId = `p${index + 1}`;
        idToPlayer.set(participantId, submission.player_id);
        const { data, error } = await supabase.storage.from("round-submissions").download(submission.storage_object_path);
        if (error || !data) throw error ?? new Error("Submission image download failed.");
        return {
          id: participantId,
          image: { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: "image/jpeg" },
        };
      })),
    );

    let result;
    try {
      const scoringStartedAt = performance.now();
      result = await withTimeout(
        scoreImages(reference, participants, undefined, {
          onAttemptComplete: ({ attempt, elapsedMs, outcome, error }) => {
            const details = error === undefined ? {} : errorDetails(error);
            const log = outcome === "success" ? console.info : console.error;
            log("Round judging Gemini attempt completed", {
              roundId,
              stage: `gemini_attempt_${attempt}`,
              elapsedMs,
              outcome,
              ...details,
            });
          },
        }),
        "gemini_scoring",
        Math.max(1, remainingWorkMs()),
      );
      console.info("Round judging stage completed", {
        roundId,
        stage: "gemini_scoring",
        elapsedMs: Math.round(performance.now() - scoringStartedAt),
      });
    } catch (error) {
      stageError("gemini_scoring", error);
    }
    const scoreRows = result.participants.map((score) => ({
      player_id: idToPlayer.get(score.id),
      expression: score.expression,
      pose: score.pose,
      style: score.style,
    }));
    if (scoreRows.some(({ player_id }) => !player_id)) {
      stageError("score_mapping", new Error("AI score mapping failed."));
    }

    const { error: completeError } = await runStage(
      "complete_round",
      COMPLETE_ROUND_TIMEOUT_MS,
      () => supabase.rpc("complete_round_judging", {
        target_round_id: roundId,
        score_rows: scoreRows,
      }),
    );
    if (completeError) stageError("complete_round", completeError);
    return NextResponse.json({ claimed: true, complete: true });
  } catch (error) {
    const stage = error instanceof JudgingStageError ? error.stage : "unexpected";
    const original = error instanceof JudgingStageError ? error.original : error;
    console.error("Round judging failed", { roundId, stage, ...errorDetails(original) });
    const invalidationStartedAt = performance.now();
    let invalidationError: unknown;
    try {
      const result = await withTimeout(
        supabase.rpc("invalidate_round_judging", { target_round_id: roundId }),
        "invalidate_round",
        INVALIDATE_ROUND_TIMEOUT_MS,
      );
      invalidationError = result.error;
    } catch (error) {
      invalidationError = error;
    }
    if (invalidationError) {
      console.error("Round invalidation failed", {
        roundId,
        stage: "invalidate_round",
        elapsedMs: Math.round(performance.now() - invalidationStartedAt),
        ...errorDetails(invalidationError),
      });
    } else {
      console.info("Round judging stage completed", {
        roundId,
        stage: "invalidate_round",
        elapsedMs: Math.round(performance.now() - invalidationStartedAt),
      });
    }
    return NextResponse.json({ error: "AI judging failed." }, { status: 502 });
  }
}
