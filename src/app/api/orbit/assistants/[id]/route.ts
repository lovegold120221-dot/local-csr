import { NextResponse } from 'next/server';
import { fetchAssistantById } from '@/lib/services/orbit';
import { logApiUsage, requireApiPrincipal } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

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
      errorMessage = "Assistant ID required";
      return NextResponse.json({ error: errorMessage }, { status });
    }
    const assistant = await fetchAssistantById(id);
    if (!assistant) {
      status = 404;
      errorMessage = "Assistant not found";
      return NextResponse.json({ error: errorMessage }, { status });
    }
    return NextResponse.json(assistant);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    status = 500;
    errorMessage = message;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await logApiUsage({
      request,
      principal: auth.principal,
      endpoint: "/api/orbit/assistants/[id]",
      statusCode: status,
      startedAtMs,
      errorMessage,
    });
  }
}
