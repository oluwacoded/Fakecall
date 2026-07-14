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
// Split into male / female so the UI can group them separately.

export const CELEBRITY_QUERIES = [
  // ── Male celebrities ───────────────────────────────────────────────────────
  { query: "donald trump",            label: "Donald Trump",        emoji: "🇺🇸", gender: "male" },
  { query: "elon musk",               label: "Elon Musk",           emoji: "🚀", gender: "male" },
  { query: "morgan freeman",          label: "Morgan Freeman",      emoji: "🎬", gender: "male" },
  { query: "arnold schwarzenegger",   label: "Arnold",              emoji: "💪", gender: "male" },
  { query: "barack obama",            label: "Barack Obama",        emoji: "🌟", gender: "male" },
  { query: "joe biden",               label: "Joe Biden",           emoji: "🦅", gender: "male" },
  { query: "joe rogan",               label: "Joe Rogan",           emoji: "🎙️", gender: "male" },
  { query: "jordan peterson",         label: "Jordan Peterson",     emoji: "🦞", gender: "male" },
  { query: "kevin hart",              label: "Kevin Hart",          emoji: "😂", gender: "male" },
  { query: "the rock dwayne johnson", label: "The Rock",            emoji: "🪨", gender: "male" },
  { query: "will smith",              label: "Will Smith",          emoji: "🎥", gender: "male" },
  { query: "samuel jackson",          label: "Samuel L. Jackson",   emoji: "🎭", gender: "male" },
  { query: "eminem",                  label: "Eminem",              emoji: "🎤", gender: "male" },
  { query: "drake",                   label: "Drake",               emoji: "🦉", gender: "male" },
  { query: "kanye west",              label: "Kanye West",          emoji: "🎵", gender: "male" },
  { query: "snoop dogg",              label: "Snoop Dogg",          emoji: "🎶", gender: "male" },
  { query: "gordon ramsay",           label: "Gordon Ramsay",       emoji: "👨‍🍳", gender: "male" },
  { query: "conor mcgregor",          label: "Conor McGregor",      emoji: "🥊", gender: "male" },
  { query: "andrew tate",             label: "Andrew Tate",         emoji: "💎", gender: "male" },
  { query: "lebron james",            label: "LeBron James",        emoji: "🏀", gender: "male" },
  // ── Female celebrities ─────────────────────────────────────────────────────
  { query: "taylor swift",            label: "Taylor Swift",        emoji: "🎸", gender: "female" },
  { query: "beyonce",                 label: "Beyoncé",             emoji: "👑", gender: "female" },
  { query: "oprah winfrey",           label: "Oprah Winfrey",       emoji: "📺", gender: "female" },
  { query: "ariana grande",           label: "Ariana Grande",       emoji: "🌙", gender: "female" },
  { query: "rihanna",                 label: "Rihanna",             emoji: "💄", gender: "female" },
  { query: "nicki minaj",             label: "Nicki Minaj",         emoji: "🩷", gender: "female" },
  { query: "cardi b",                 label: "Cardi B",             emoji: "💅", gender: "female" },
  { query: "lady gaga",               label: "Lady Gaga",           emoji: "🎭", gender: "female" },
  { query: "adele",                   label: "Adele",               emoji: "🎶", gender: "female" },
  { query: "kim kardashian",          label: "Kim Kardashian",      emoji: "🌸", gender: "female" },
  { query: "jennifer lopez",          label: "Jennifer Lopez",      emoji: "💃", gender: "female" },
  { query: "scarlett johansson",      label: "Scarlett Johansson",  emoji: "🎬", gender: "female" },
] as const;

// Simple in-memory cache for voice search results
const voiceCache = new Map<string, { voiceId: string; name: string } | null>();

export async function findCelebrityVoice(
  query: string,
): Promise<{ voiceId: string; name: string } | null> {
  if (voiceCache.has(query)) return voiceCache.get(query)!;

  try {
    const apiKey = getApiKey();
    const url = `https://api.elevenlabs.io/v1/shared-voices?search=${encodeURIComponent(query)}&page_size=3`;
    const resp = await fetch(url, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      voiceCache.set(query, null);
      return null;
    }

    const data = (await resp.json()) as { voices?: Array<{ voice_id: string; name: string }> };
    const first = data.voices?.[0];
    if (!first) {
      voiceCache.set(query, null);
      return null;
    }

    const result = { voiceId: first.voice_id, name: first.name };
    voiceCache.set(query, result);
    return result;
  } catch {
    voiceCache.set(query, null);
    return null;
  }
}

export async function getCelebrityVoices(): Promise<
  Array<{ voiceId: string; name: string; emoji: string; query: string; gender: string }>
> {
  const results = await Promise.all(
    CELEBRITY_QUERIES.map(async (c) => {
      const voice = await findCelebrityVoice(c.query);
      if (!voice) return null;
      return {
        voiceId: voice.voiceId,
        name: c.label,
        emoji: c.emoji,
        query: c.query,
        gender: c.gender,
      };
    }),
  );
  return results.filter(Boolean) as Array<{
    voiceId: string;
    name: string;
    emoji: string;
    query: string;
    gender: string;
  }>;
}

// ── Built-in realistic voice presets (ElevenLabs owned voices) ────────────────
// These go through full STS pipeline for the most realistic result.
export const VOICE_PRESETS = {
  // Deep, authoritative male
  male:        "pNInz6obpgDQGcFmaJgB",  // Adam
  // Second male option — younger/casual
  male2:       "TxGEqnHWrfWFTfGW9XjX",  // Josh
  // Warm, natural female
  female:      "EXAVITQu4vr4xnSDxMaL",  // Bella
  // Second female option — clear/professional
  female2:     "21m00Tcm4TlvDq8ikWAM",  // Rachel
} as const;

// ── Base voice list returned to the client ────────────────────────────────────
export const BASE_VOICES = [
  { voiceId: "natural",               name: "Natural",          emoji: "🎙️", category: "base", gender: "neutral", description: "Your real voice" },
  { voiceId: VOICE_PRESETS.male,      name: "Deep Male",        emoji: "🔵", category: "base", gender: "male",    description: "Low, authoritative" },
  { voiceId: VOICE_PRESETS.male2,     name: "Casual Male",      emoji: "💬", category: "base", gender: "male",    description: "Young, relaxed" },
  { voiceId: VOICE_PRESETS.female,    name: "Warm Female",      emoji: "🌸", category: "base", gender: "female",  description: "Soft, intimate" },
  { voiceId: VOICE_PRESETS.female2,   name: "Clear Female",     emoji: "✨", category: "base", gender: "female",  description: "Crisp, professional" },
];

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
