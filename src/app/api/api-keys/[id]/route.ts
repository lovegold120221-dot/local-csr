import { NextResponse } from "next/server";
import { createSupabaseClientFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getAuthedSupabase(request: Request) {
  const supabase = createSupabaseClientFromRequest(request);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return { supabase, userId: data.user.id };
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedSupabase(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Key ID required" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "API key not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id: data.id });
}

