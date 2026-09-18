import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { scoreImages } from "@/lib/vision/score-images";
import type { ParticipantImage, VisionImage } from "@/lib/vision/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ roundId: string }> };
type JudgingStage =
  | "round_query"
  | "submission_query"
  | "reference_load"
  | "storage_download"
  | "gemini_scoring"
  | "score_mapping"
  | "complete_round";

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

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

async function loadReference(referencePath: string): Promise<VisionImage> {
  if (!/^\/reference-memes\/[a-z0-9-]+\.jpg$/.test(referencePath)) {
    throw new Error("Round reference image path is invalid.");
  }
  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, `.${referencePath}`);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("Round reference image path is invalid.");
  }
  return { bytes: new Uint8Array(await readFile(absolutePath)), mimeType: "image/jpeg" };
}

export async function POST(request: Request, { params }: RouteContext) {
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
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("Round judging authentication failed", {
      roundId,
      stage: "jwt_verification",
      ...errorDetails(userError ?? new Error("Authenticated user was not returned.")),
    });
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_round_judging", {
    target_round_id: roundId,
    requester_user_id: userData.user.id,
  });
  if (claimError) {
    console.error("Round judging claim failed", {
      roundId,
      stage: "claim_round",
      ...errorDetails(claimError),
    });
    return NextResponse.json({ error: "Could not start judging." }, { status: 500 });
  }
  if (!claimed) return NextResponse.json({ claimed: false });

  try {
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("reference_image_path")
      .eq("id", roundId)
      .single();
    if (roundError || !round) stageError("round_query", roundError ?? new Error("Round not found."));

    const { data: submissions, error: submissionsError } = await supabase
      .from("round_submissions")
      .select("player_id, storage_object_path, submitted_at")
      .eq("round_id", roundId)
      .order("submitted_at");
    if (submissionsError || !submissions?.length) {
      stageError("submission_query", submissionsError ?? new Error("Round submissions not found."));
    }

    let reference: VisionImage;
    try {
      reference = await loadReference(round.reference_image_path);
    } catch (error) {
      stageError("reference_load", error);
    }
    const idToPlayer = new Map<string, string>();
    const participants: ParticipantImage[] = await Promise.all(submissions.map(async (submission, index) => {
      const participantId = `p${index + 1}`;
      idToPlayer.set(participantId, submission.player_id);
      const { data, error } = await supabase.storage.from("round-submissions").download(submission.storage_object_path);
      if (error || !data) stageError("storage_download", error ?? new Error("Submission image download failed."));
      return {
        id: participantId,
        image: { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: "image/jpeg" },
      };
    }));

    let result;
    try {
      result = await scoreImages(reference, participants);
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

    const { error: completeError } = await supabase.rpc("complete_round_judging", {
      target_round_id: roundId,
      score_rows: scoreRows,
    });
    if (completeError) stageError("complete_round", completeError);
    return NextResponse.json({ claimed: true, complete: true });
  } catch (error) {
    const stage = error instanceof JudgingStageError ? error.stage : "unexpected";
    const original = error instanceof JudgingStageError ? error.original : error;
    console.error("Round judging failed", { roundId, stage, ...errorDetails(original) });
    const { error: invalidationError } = await supabase.rpc("invalidate_round_judging", {
      target_round_id: roundId,
    });
    if (invalidationError) {
      console.error("Round invalidation failed", {
        roundId,
        stage: "invalidate_round",
        ...errorDetails(invalidationError),
      });
    }
    return NextResponse.json({ error: "AI judging failed." }, { status: 502 });
  }
}
