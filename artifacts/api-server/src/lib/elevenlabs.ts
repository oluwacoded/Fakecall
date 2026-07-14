/**
 * ElevenLabs integration for voice transformation.
 * Uses ELEVENLABS_API_KEY environment variable directly.
 */

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable not set. Add it in Secrets.",
    );
  }
  return key;
}

// ── Celebrity voice catalogue ─────────────────────────────────────────────────
// Each entry: { id, name, emoji, category }
// IDs are searched live from ElevenLabs shared voice library on first call.
export const CELEBRITY_QUERIES = [
  { query: "donald trump", label: "Donald Trump", emoji: "🇺🇸" },
  { query: "elon musk", label: "Elon Musk", emoji: "🚀" },
  { query: "morgan freeman", label: "Morgan Freeman", emoji: "🎬" },
  { query: "arnold schwarzenegger", label: "Arnold", emoji: "💪" },
  { query: "barack obama", label: "Barack Obama", emoji: "🌟" },
  { query: "joe biden", label: "Joe Biden", emoji: "🦅" },
  { query: "drake", label: "Drake", emoji: "🎤" },
  { query: "kanye west", label: "Kanye West", emoji: "🎵" },
  { query: "snoop dogg", label: "Snoop Dogg", emoji: "🎶" },
  { query: "samuel jackson", label: "Samuel L. Jackson", emoji: "🎥" },
] as const;

// Simple in-memory cache for voice search results
const voiceCache = new Map<string, { voiceId: string; name: string }>();

export async function findCelebrityVoice(
  query: string,
): Promise<{ voiceId: string; name: string } | null> {
  if (voiceCache.has(query)) return voiceCache.get(query)!;

  try {
    const apiKey = getApiKey();
    const url = `https://api.elevenlabs.io/v1/shared-voices?search=${encodeURIComponent(query)}&page_size=1`;
    const resp = await fetch(url, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as { voices?: Array<{ voice_id: string; name: string }> };
    const first = data.voices?.[0];
    if (!first) return null;

    const result = { voiceId: first.voice_id, name: first.name };
    voiceCache.set(query, result);
    return result;
  } catch {
    return null;
  }
}

export async function getCelebrityVoices(): Promise<
  Array<{ voiceId: string; name: string; emoji: string; query: string }>
> {
  const results = await Promise.all(
    CELEBRITY_QUERIES.map(async (c) => {
      const voice = await findCelebrityVoice(c.query);
      if (!voice) return null;
      return { voiceId: voice.voiceId, name: c.label, emoji: c.emoji, query: c.query };
    }),
  );
  return results.filter(Boolean) as Array<{
    voiceId: string;
    name: string;
    emoji: string;
    query: string;
  }>;
}

// ── Preset voices ─────────────────────────────────────────────────────────────
export const VOICE_PRESETS = {
  male: "pNInz6obpgDQGcFmaJgB",   // Adam — deep male
  female: "EXAVITQu4vr4xnSDxMaL", // Bella — warm female
} as const;

// ── List user's own voices ────────────────────────────────────────────────────
export async function getElevenLabsVoices() {
  const apiKey = getApiKey();
  const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`ElevenLabs voices fetch failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { voices?: unknown[] };
  return data.voices ?? [];
}

// ── Speech-to-Speech ─────────────────────────────────────────────────────────
export async function transformVoice(
  audioBuffer: Buffer,
  voiceId: string,
  modelId = "eleven_english_sts_v2",
): Promise<Buffer> {
  const apiKey = getApiKey();

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("audio", blob, "audio.wav");
  formData.append("model_id", modelId);
  // Lower stability = more expressive, closer to the voice actor
  formData.append("voice_settings", JSON.stringify({
    stability: 0.3,
    similarity_boost: 0.85,
    style: 0.2,
    use_speaker_boost: true,
  }));

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs STS failed: ${resp.status} — ${err}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
