import { NextResponse } from 'next/server';
import { createSupabaseClientFromRequest } from '@/lib/supabase-server';
import { generateTTS } from '@/lib/services/echo';
import { DEFAULT_ECHO_ALIAS } from '@/lib/eburon-alias-router';

const BUCKET = 'tts-audio';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createSupabaseClientFromRequest(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'mp3';

    const { data: row, error: selectError } = await supabase
      .from('tts_history')
      .select('audio_path, text, voice_id')
      .eq('id', id)
      .single();
    if (selectError || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (format === 'wav' && row.text && row.voice_id) {
      const blob = await generateTTS(row.voice_id, row.text, DEFAULT_ECHO_ALIAS, 'wav_44100');
      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Disposition': `attachment; filename="tts_${id}.wav"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    if (!row.audio_path && row.text && row.voice_id) {
      const outputFormat = format === 'wav' ? 'wav_44100' : 'mp3_44100_128';
      const blob = await generateTTS(row.voice_id, row.text, DEFAULT_ECHO_ALIAS, outputFormat);
      return new NextResponse(blob, {
        headers: {
          'Content-Type': format === 'wav' ? 'audio/wav' : 'audio/mpeg',
          'Content-Disposition': `attachment; filename="tts_${id}.${format}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
    if (!row.audio_path) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { data: file, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(row.audio_path);
    if (downloadError || !file) {
      console.error('tts-history audio download error:', downloadError);
      return NextResponse.json({ error: 'Failed to load audio' }, { status: 500 });
    }
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
