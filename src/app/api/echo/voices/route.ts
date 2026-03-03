import { NextResponse } from 'next/server';
import { fetchVoices } from '@/lib/services/echo';
import { toEburonError, eburonJsonResponse } from '@/lib/eburon';

export async function GET() {
  try {
    const voices = await fetchVoices();
    return NextResponse.json(voices);
  } catch (error: unknown) {
    const eburonErr = toEburonError(error);
    console.error('[echo/voices]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
