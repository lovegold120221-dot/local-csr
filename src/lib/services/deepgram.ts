const DEEPGRAM_API_KEY =
  process.env.DEEPGRAM_API_KEY ||
  process.env.DEEPGRAM_KEY ||
  process.env.DEEPGRAM ||
  "";

const DEEPGRAM_BASE_URL = process.env.DEEPGRAM_BASE_URL || "https://api.deepgram.com/v1";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || "nova-3";

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: Array<{
          word?: string;
          start?: number;
          end?: number;
          confidence?: number;
          punctuated_word?: string;
        }>;
      }>;
      detected_language?: string;
      language?: string;
    }>;
  };
  metadata?: {
    request_id?: string;
    created?: string;
    duration?: number;
  };
};

function getDeepgramApiKey(): string {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("Missing Deepgram API key. Set DEEPGRAM_API_KEY in .env.");
  }
  return DEEPGRAM_API_KEY;
}

function getListenUrl(): string {
  const params = new URLSearchParams({
    detect_entities: "true",
    sentiment: "true",
    smart_format: "true",
    summarize: "v2",
    detect_language: "true",
    model: DEEPGRAM_MODEL,
  });
  return `${DEEPGRAM_BASE_URL.replace(/\/$/, "")}/listen?${params.toString()}`;
}

function extractTranscript(payload: DeepgramResponse): string {
  const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return transcript.trim();
}

function getDetectedLanguage(payload: DeepgramResponse): string | null {
  const lang = payload.results?.channels?.[0]?.detected_language || payload.results?.channels?.[0]?.language;
  return typeof lang === "string" && lang.trim() ? lang.trim() : null;
}

async function parseDeepgramResponse(res: Response): Promise<DeepgramResponse> {
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Deepgram request failed (${res.status})`);
  }
  return (await res.json()) as DeepgramResponse;
}

export async function transcribeWithDeepgramFile(file: File) {
  const key = getDeepgramApiKey();
  const body = await file.arrayBuffer();
  if (!body.byteLength) throw new Error("Uploaded file is empty.");

  const res = await fetch(getListenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body,
  });

  const payload = await parseDeepgramResponse(res);
  return {
    text: extractTranscript(payload),
    language: getDetectedLanguage(payload),
    provider: "deepgram",
    model: DEEPGRAM_MODEL,
    raw: payload,
  };
}

export async function transcribeWithDeepgramUrl(audioUrl: string) {
  const key = getDeepgramApiKey();
  const trimmedUrl = audioUrl.trim();
  if (!trimmedUrl) throw new Error("Audio URL is empty.");

  const res = await fetch(getListenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: trimmedUrl }),
  });

  const payload = await parseDeepgramResponse(res);
  return {
    text: extractTranscript(payload),
    language: getDetectedLanguage(payload),
    provider: "deepgram",
    model: DEEPGRAM_MODEL,
    raw: payload,
  };
}
