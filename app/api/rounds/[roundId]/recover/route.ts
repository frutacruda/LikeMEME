import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ roundId: string }> };

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
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
    console.error("Stale judging recovery authentication failed", {
      roundId,
      code: userError?.code,
      message: userError?.message ?? "Authenticated user was not returned.",
    });
    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const { data: recovered, error } = await supabase.rpc("invalidate_stale_round_judging", {
    target_round_id: roundId,
    requester_user_id: userData.user.id,
  });
  if (error) {
    console.error("Stale judging recovery failed", {
      roundId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Could not recover stale judging." }, { status: 500 });
  }

  return NextResponse.json({ recovered: Boolean(recovered) });
}
