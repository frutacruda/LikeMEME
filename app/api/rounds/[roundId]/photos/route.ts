import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SIGNED_URL_EXPIRES_IN_SECONDS = 90;
type RouteContext = { params: Promise<{ roundId: string }> };

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function authenticatedSupabaseClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase public environment variables are not configured.");
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { roundId } = await params;
  if (!isUuid(roundId)) return NextResponse.json({ error: "Invalid round ID." }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("Round photo authentication failed", {
      roundId,
      code: userError?.code,
      message: userError?.message ?? "Authenticated user was not returned.",
    });
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const authenticatedSupabase = authenticatedSupabaseClient(token);

  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("room_id, status")
    .eq("id", roundId)
    .single();
  if (roundError || !round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }
  if (round.status !== "complete") {
    return NextResponse.json({ error: "Round photos are not available." }, { status: 409 });
  }

  const { data: player, error: playerError } = await authenticatedSupabase
    .from("players")
    .select("id")
    .eq("room_id", round.room_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (playerError) {
    console.error("Round photo membership lookup failed", {
      roundId,
      code: playerError.code,
      message: playerError.message,
    });
    return NextResponse.json({ error: "Could not verify room membership." }, { status: 500 });
  }
  if (!player) return NextResponse.json({ error: "Room membership required." }, { status: 403 });

  const { data: roundPlayer, error: roundPlayerError } = await authenticatedSupabase
    .from("round_players")
    .select("player_id")
    .eq("round_id", roundId)
    .eq("player_id", player.id)
    .maybeSingle();
  if (roundPlayerError) {
    console.error("Round photo participation lookup failed", {
      roundId,
      code: roundPlayerError.code,
      message: roundPlayerError.message,
    });
    return NextResponse.json({ error: "Could not verify round participation." }, { status: 500 });
  }
  if (!roundPlayer) return NextResponse.json({ error: "Round participation required." }, { status: 403 });

  const { data: submissions, error: submissionsError } = await supabase
    .from("round_submissions")
    .select("player_id, storage_object_path")
    .eq("round_id", roundId);
  if (submissionsError) {
    console.error("Round photo submission lookup failed", {
      roundId,
      code: submissionsError.code,
      message: submissionsError.message,
    });
    return NextResponse.json({ error: "Could not load round photos." }, { status: 500 });
  }

  const photos = await Promise.all(submissions.map(async (submission) => {
    const { data, error } = await supabase.storage
      .from("round-submissions")
      .createSignedUrl(submission.storage_object_path, SIGNED_URL_EXPIRES_IN_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error("Signed URL was not returned.");
    return { playerId: submission.player_id, signedUrl: data.signedUrl };
  })).catch((error: unknown) => {
    const details = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
    console.error("Round photo signed URL creation failed", {
      roundId,
      code: details.code,
      message: details.message ?? "Unknown signed URL error.",
    });
    return null;
  });

  if (!photos) return NextResponse.json({ error: "Could not prepare round photos." }, { status: 500 });
  return NextResponse.json(
    { photos, expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
