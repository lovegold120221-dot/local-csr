import { NextResponse } from 'next/server';
import { fetchCalls } from '@/lib/services/orbit';
import { logApiUsage, requireApiPrincipal } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const auth = await requireApiPrincipal(request);
  if (!auth.ok) return auth.response;

  let status = 200;
  let errorMessage: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const assistantId = searchParams.get('assistantId') ?? undefined;
    const params: { limit?: number; assistantId?: string } = {};
    if (limit != null && limit !== '') params.limit = Number(limit);
    if (assistantId) params.assistantId = assistantId;
    const calls = await fetchCalls(Object.keys(params).length > 0 ? params : undefined);
    return NextResponse.json(calls);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    status = 500;
    errorMessage = message;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await logApiUsage({
      request,
      principal: auth.principal,
      endpoint: "/api/orbit/calls",
      statusCode: status,
      startedAtMs,
      errorMessage,
    });
  }
}
