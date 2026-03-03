import { NextResponse } from 'next/server';
import { createOutboundCall } from '@/lib/services/orbit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { assistantId, customerNumber } = body;
    if (!assistantId || !customerNumber) {
      return NextResponse.json(
        { error: 'assistantId and customerNumber are required' },
        { status: 400 }
      );
    }
    const result = await createOutboundCall({ assistantId, customerNumber });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const { toEburonError, eburonJsonResponse } = await import('@/lib/eburon');
    const eburonErr = toEburonError(error);
    console.error('[orbit/call]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
