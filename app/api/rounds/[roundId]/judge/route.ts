import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { scoreImages } from "@/lib/vision/score-images";
import type { ParticipantImage, VisionImage } from "@/lib/vision/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ roundId: string }> };

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
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { roundId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roundId)) {
    return NextResponse.json({ error: "Invalid round ID." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_round_judging", {
    target_round_id: roundId,
    requester_user_id: userData.user.id,
  });
  if (claimError) {
    console.error("Round judging claim failed", { roundId, message: claimError.message });
    return NextResponse.json({ error: "Could not start judging." }, { status: 500 });
  }
  if (!claimed) return NextResponse.json({ claimed: false });

  try {
    const [{ data: round, error: roundError }, { data: submissions, error: submissionsError }] = await Promise.all([
      supabase.from("rounds").select("reference_image_path").eq("id", roundId).single(),
      supabase.from("round_submissions").select("player_id, storage_object_path, submitted_at").eq("round_id", roundId).order("submitted_at"),
    ]);
    if (roundError || !round) throw roundError ?? new Error("Round not found.");
    if (submissionsError || !submissions?.length) throw submissionsError ?? new Error("Round submissions not found.");

    const reference = await loadReference(round.reference_image_path);
    const idToPlayer = new Map<string, string>();
    const participants: ParticipantImage[] = await Promise.all(submissions.map(async (submission, index) => {
      const participantId = `p${index + 1}`;
      idToPlayer.set(participantId, submission.player_id);
      const { data, error } = await supabase.storage.from("round-submissions").download(submission.storage_object_path);
      if (error || !data) throw error ?? new Error("Submission image download failed.");
      return {
        id: participantId,
        image: { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: "image/jpeg" },
      };
    }));

    const result = await scoreImages(reference, participants);
    const scoreRows = result.participants.map((score) => ({
      player_id: idToPlayer.get(score.id),
      expression: score.expression,
      pose: score.pose,
      style: score.style,
    }));
    if (scoreRows.some(({ player_id }) => !player_id)) throw new Error("AI score mapping failed.");

    const { error: completeError } = await supabase.rpc("complete_round_judging", {
      target_round_id: roundId,
      score_rows: scoreRows,
    });
    if (completeError) throw completeError;
    return NextResponse.json({ claimed: true, complete: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown judging error";
    console.error("Round judging failed", { roundId, message });
    const { error: invalidationError } = await supabase.rpc("invalidate_round_judging", {
      target_round_id: roundId,
    });
    if (invalidationError) {
      console.error("Round invalidation failed", { roundId, message: invalidationError.message });
    }
    return NextResponse.json({ error: "AI judging failed." }, { status: 502 });
  }
}
