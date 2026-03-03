import { NextResponse } from 'next/server';
import { fetchModels } from '@/lib/services/echo';
import { toEburonError, eburonJsonResponse } from '@/lib/eburon';

export async function GET() {
  try {
    const models = await fetchModels();
    return NextResponse.json(models);
  } catch (error: unknown) {
    const eburonErr = toEburonError(error);
    console.error('[echo/models]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
