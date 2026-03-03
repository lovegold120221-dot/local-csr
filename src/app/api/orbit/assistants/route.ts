import { NextResponse } from 'next/server';
import { fetchAssistants } from '@/lib/services/orbit';

export async function GET() {
  try {
    const list = await fetchAssistants();
    return NextResponse.json(Array.isArray(list) ? list : []);
  } catch (error: unknown) {
    const { toEburonError, eburonJsonResponse } = await import('@/lib/eburon');
    const eburonErr = toEburonError(error);
    console.error('[orbit/assistants]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
