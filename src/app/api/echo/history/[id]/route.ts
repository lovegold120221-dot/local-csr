import { NextResponse } from 'next/server';
import { echoProviderRequest } from '@/lib/services/echo';
import { logApiUsage, requireApiPrincipal } from '@/lib/api-key-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();
  const auth = await requireApiPrincipal(request);
  if (!auth.ok) return auth.response;

  let status = 200;
  let errorMessage: string | null = null;
  try {
    const { id } = await params;
    if (!id) {
      status = 400;
      errorMessage = "History ID required";
      return NextResponse.json({ error: errorMessage }, { status });
    }
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'mp3';

    if (format === 'wav') {
      const res = await echoProviderRequest('/history/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_item_ids: [id], output_format: 'wav' }),
      });
      const blob = await res.blob();
      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Disposition': `attachment; filename="tts_${id}.wav"`,
        },
      });
    }

    const res = await echoProviderRequest(`/history/${id}/audio`);
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    status = 500;
    errorMessage = message;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await logApiUsage({
      request,
      principal: auth.principal,
      endpoint: "/api/echo/history/[id]",
      statusCode: status,
      startedAtMs,
      errorMessage,
    });
  }
}
