import { NextResponse } from 'next/server';
import { generateTTS } from '@/lib/services/echo';
import { toEburonError, eburonJsonResponse } from '@/lib/eburon';

export async function POST(req: Request) {
  try {
    const { voiceId, text, modelId, outputFormat } = await req.json();
    const blob = await generateTTS(voiceId, text, modelId, outputFormat);
    return new Response(blob, {
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (error: unknown) {
    const eburonErr = toEburonError(error);
    console.error('[echo/tts]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
