# EchoLabs

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app), featuring a comprehensive dashboard for Clone, STT, TTS, and Create from Eburon AI.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### TTS History (per-user)

To save and replay generated TTS per user, set up Supabase and run the migration:

1. Create a project at [Supabase](https://supabase.com) and add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.
2. In the Supabase SQL Editor, run the script in `supabase/migrations/20250301000000_tts_history.sql` to create the `tts_history` table and `tts-audio` storage bucket with RLS.

After that, signed-in users get their TTS saved automatically and can play or download from the **History** tab.

### API Keys (authenticated API + usage tracking)

The API now supports per-user API keys (created in **Settings → API Keys**) and usage logs.

Required env var for server-side API key validation/logging:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- API keys are stored as SHA-256 hashes (raw keys are shown once on creation).
- Usage is tracked per request (`endpoint`, `method`, `status_code`, `latency_ms`).
- Apply `supabase/migrations/20260301000002_api_keys_and_usage.sql` (or run `supabase/SETUP.sql`) to create `api_keys` and `api_usage`.

### STT via Deepgram

Speech-to-Text now uses Deepgram (`/api/echo/stt`).

Required env var:

```bash
DEEPGRAM_API_KEY=your-deepgram-key
```

Optional:

```bash
DEEPGRAM_MODEL=nova-3
```

The STT response is also wired into **Create → Describe your agent**, and you can generate an agent template directly from:
- STT transcript output
- TTS editor prompt text

### VAPI / Orbit (agents & calls)

Use **two** keys so the private key never reaches the client:

| Purpose | Env variable | Key type | Where |
|--------|--------------|----------|--------|
| Agent fetch & create (server) | `VAPI_PRIVATE_API_KEY` or `ORBIT_SECRET` | **Private API Key** | `.env.local` (no `NEXT_PUBLIC_`) |
| Client SDK (calls) | `NEXT_PUBLIC_ORBIT_TOKEN` | **Public API Key** | `.env.local` |

- **Private key**: used only in API routes (`/api/orbit/assistants`, `/api/orbit/agents`) for listing and creating assistants. Do not prefix with `NEXT_PUBLIC_`.
- **Public key**: used by the browser for the Orbit (VAPI) Web SDK to start/control calls. Safe to expose.

Example `.env.local` (use your own keys from the VAPI dashboard):

```bash
# VAPI: server-side (agent fetch/create) — Private API Key
VAPI_PRIVATE_API_KEY=your-private-key-here

# VAPI: client-side (Orbit SDK) — Public API Key
NEXT_PUBLIC_ORBIT_TOKEN=your-public-key-here
```

### LiveKit (CSR web call)

For deploying the sample CSR web call (VAPI/Orbit over LiveKit), set:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
```

These are used by the call infrastructure (e.g. orbit-eburon) for real-time audio.

### TTS input text enhancer

The **Text to Speech** tab includes enhancer buttons aligned with ElevenLabs and production TTS best practices:

| Button | What it does |
|--------|----------------|
| **Enhance symbols** | Converts written symbols to spoken form: `user@company.com` → "user at company dot com", `/` → " slash ". Use for emails, URLs, and codes. |
| **Normalize for TTS** | Full normalization: phone numbers (e.g. 555-555-5555 → "five five five, five five five, five five five five"), currency ($42.50 → "forty-two dollars and fifty cents"), ordinals (1st → first), decimals (3.14 → "three point one four"), abbreviations (Dr., Ave., St.), shortcuts (Ctrl+Z → "control z"), and percent. Then applies symbol normalization. |
| **Add pause** | Appends `<break time="1s" />` for a 1-second pause (ElevenLabs supports up to 3s). |
| **Add expression** | Calls an LLM (Ollama or OpenAI) to insert **audio tags** (e.g. `[laughing]`, `[sighs]`, `[whispers]`) into the text without changing the words. Requires `OLLAMA_BASE_URL` (and optionally `OLLAMA_MODEL`) or `OPENAI_API_KEY`. |

For Eleven v3 you can use **audio tags** in the text (e.g. `[laughs]`, `[whispers]`, `[sighs]`); the enhancer leaves them unchanged. Use **Add expression** to have an LLM suggest and insert such tags automatically.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
