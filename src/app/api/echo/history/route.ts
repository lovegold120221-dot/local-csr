import { NextResponse } from 'next/server';
import { fetchHistory } from '@/lib/services/echo';
import { logApiUsage, requireApiPrincipal } from '@/lib/api-key-auth';

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const auth = await requireApiPrincipal(request);
  if (!auth.ok) return auth.response;

  let status = 200;
  let errorMessage: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const page_size = searchParams.get('page_size');
    const start_after_history_item_id = searchParams.get('start_after_history_item_id') ?? undefined;
    const voice_id = searchParams.get('voice_id') ?? undefined;
    const model_id = searchParams.get('model_id') ?? undefined;
    const date_before_unix = searchParams.get('date_before_unix');
    const date_after_unix = searchParams.get('date_after_unix');
    const sort_direction = searchParams.get('sort_direction');
    const search = searchParams.get('search') ?? undefined;
    const source = searchParams.get('source') ?? undefined;

    const params: Parameters<typeof fetchHistory>[0] = {};
    if (page_size != null && page_size !== '') params.page_size = Number(page_size);
    if (start_after_history_item_id) params.start_after_history_item_id = start_after_history_item_id;
    if (voice_id) params.voice_id = voice_id;
    if (model_id) params.model_id = model_id;
    if (date_before_unix != null && date_before_unix !== '') params.date_before_unix = Number(date_before_unix);
    if (date_after_unix != null && date_after_unix !== '') params.date_after_unix = Number(date_after_unix);
    if (sort_direction === 'asc' || sort_direction === 'desc') params.sort_direction = sort_direction;
    if (search) params.search = search;
    if (source) params.source = source;

    const history = await fetchHistory(Object.keys(params).length > 0 ? params : undefined);
    return NextResponse.json(history);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    status = 500;
    errorMessage = message;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await logApiUsage({
      request,
      principal: auth.principal,
      endpoint: "/api/echo/history",
      statusCode: status,
      startedAtMs,
      errorMessage,
    });
  }
}
