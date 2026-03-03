import { NextResponse } from "next/server";
import { createSupabaseClientFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type UsageRow = {
  endpoint: string;
  status_code: number;
  latency_ms: number;
  created_at: string;
};

async function getAuthedSupabase(request: Request) {
  const supabase = createSupabaseClientFromRequest(request);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return { supabase, userId: data.user.id };
}

export async function GET(request: Request) {
  const auth = await getAuthedSupabase(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawDays = Number(searchParams.get("days") || 7);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await auth.supabase
    .from("api_usage")
    .select("endpoint, status_code, latency_ms, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as UsageRow[];
  const byEndpoint = new Map<string, { requests: number; errors: number; avgLatencyMs: number }>();
  const byDay = new Map<string, number>();

  let success = 0;
  let errors = 0;
  let totalLatency = 0;

  for (const row of rows) {
    const endpoint = row.endpoint || "unknown";
    const endpointAgg = byEndpoint.get(endpoint) ?? { requests: 0, errors: 0, avgLatencyMs: 0 };
    endpointAgg.requests += 1;
    endpointAgg.avgLatencyMs += row.latency_ms || 0;
    if (row.status_code >= 400) endpointAgg.errors += 1;
    byEndpoint.set(endpoint, endpointAgg);

    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);

    totalLatency += row.latency_ms || 0;
    if (row.status_code >= 200 && row.status_code < 400) success += 1;
    if (row.status_code >= 400) errors += 1;
  }

  const endpointStats = Array.from(byEndpoint.entries())
    .map(([endpoint, agg]) => ({
      endpoint,
      requests: agg.requests,
      errors: agg.errors,
      avgLatencyMs: agg.requests > 0 ? Math.round(agg.avgLatencyMs / agg.requests) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  const dayStats = Array.from(byDay.entries())
    .map(([day, requests]) => ({ day, requests }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({
    days,
    totalRequests: rows.length,
    successRequests: success,
    errorRequests: errors,
    avgLatencyMs: rows.length > 0 ? Math.round(totalLatency / rows.length) : 0,
    endpointStats,
    dayStats,
  });
}

