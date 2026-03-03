import { NextResponse } from 'next/server';
import { uploadFile } from '@/lib/services/orbit';
import { logApiUsage, requireApiPrincipal } from '@/lib/api-key-auth';

const ACCEPTED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'text/markdown',
  'text/tab-separated-values',
  'application/x-yaml',
  'application/json',
  'application/xml',
  'text/x-log',
];

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  const auth = await requireApiPrincipal(req);
  if (!auth.ok) return auth.response;

  let status = 200;
  let errorMessage: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file?.size) {
      status = 400;
      errorMessage = "No file provided";
      return NextResponse.json({ error: errorMessage }, { status });
    }
    if (file.size > 300 * 1024) {
      status = 400;
      errorMessage = "File too large. Keep files under 300KB for best performance.";
      return NextResponse.json(
        { error: errorMessage },
        { status }
      );
    }
    const type = file.type || '';
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['txt', 'pdf', 'docx', 'doc', 'csv', 'md', 'tsv', 'yaml', 'yml', 'json', 'xml', 'log'];
    const isAllowedType = ACCEPTED_TYPES.includes(type) || allowedExts.includes(ext);
    if (!isAllowedType) {
      status = 400;
      errorMessage = `Unsupported format. Use: ${allowedExts.join(', ')}`;
      return NextResponse.json(
        { error: errorMessage },
        { status }
      );
    }
    const result = await uploadFile(file, file.name);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    status = 500;
    errorMessage = message;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await logApiUsage({
      request: req,
      principal: auth.principal,
      endpoint: "/api/orbit/file",
      statusCode: status,
      startedAtMs,
      errorMessage,
    });
  }
}
