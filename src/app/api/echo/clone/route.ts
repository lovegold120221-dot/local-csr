import { NextResponse } from 'next/server';
import { cloneVoice } from '@/lib/services/echo';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const files = formData.getAll('files') as File[];
    const labelsRaw = formData.get('labels') as string;
    const labels = labelsRaw ? JSON.parse(labelsRaw) : {};

    if (!name || files.length === 0) throw new Error("Name and files are required");

    const result = await cloneVoice(name, description, files, labels);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const { toEburonError, eburonJsonResponse } = await import('@/lib/eburon');
    const eburonErr = toEburonError(error);
    console.error('[echo/clone]', { code: eburonErr.code, detail: eburonErr.detail });
    return NextResponse.json(...eburonJsonResponse(eburonErr));
  }
}
