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
  { query: "donald trump",   terms: ["trump", "donald trump", "president trump"],  label: "Donald Trump",       emoji: "🇺🇸", gender: "male" },
  { query: "elon musk",      terms: ["elon musk", "elon", "musk spacex"],          label: "Elon Musk",          emoji: "🚀", gender: "male" },
  { query: "morgan freeman", terms: ["morgan freeman", "morgan"],                  label: "Morgan Freeman",     emoji: "🎬", gender: "male" },
  { query: "arnold",         terms: ["arnold schwarzenegger", "arnold", "terminator"], label: "Arnold",         emoji: "💪", gender: "male" },
  { query: "barack obama",   terms: ["obama", "barack obama", "president obama"],  label: "Barack Obama",       emoji: "🌟", gender: "male" },
  { query: "joe biden",      terms: ["biden", "joe biden"],                        label: "Joe Biden",          emoji: "🦅", gender: "male" },
  { query: "joe rogan",      terms: ["joe rogan", "rogan"],                        label: "Joe Rogan",          emoji: "🎙️", gender: "male" },
  { query: "jordan peterson",terms: ["jordan peterson", "peterson"],               label: "Jordan Peterson",    emoji: "🦞", gender: "male" },
  { query: "kevin hart",     terms: ["kevin hart", "hart comedian"],               label: "Kevin Hart",         emoji: "😂", gender: "male" },
  { query: "dwayne johnson", terms: ["dwayne johnson", "the rock"],                label: "The Rock",           emoji: "🪨", gender: "male" },
  { query: "will smith",     terms: ["will smith", "fresh prince"],                label: "Will Smith",         emoji: "🎥", gender: "male" },
  { query: "samuel jackson", terms: ["samuel jackson", "samuel l jackson"],        label: "Samuel L. Jackson",  emoji: "🎭", gender: "male" },
  { query: "eminem",         terms: ["eminem", "slim shady", "marshall mathers"],  label: "Eminem",             emoji: "🎤", gender: "male" },
  { query: "drake",          terms: ["drake rapper", "drake"],                     label: "Drake",              emoji: "🦉", gender: "male" },
  { query: "kanye west",     terms: ["kanye west", "kanye", "ye"],                 label: "Kanye West",         emoji: "🎵", gender: "male" },
  { query: "snoop dogg",     terms: ["snoop dogg", "snoop"],                       label: "Snoop Dogg",         emoji: "🎶", gender: "male" },
  { query: "gordon ramsay",  terms: ["gordon ramsay", "ramsay chef"],              label: "Gordon Ramsay",      emoji: "👨‍🍳", gender: "male" },
  { query: "conor mcgregor", terms: ["conor mcgregor", "mcgregor"],                label: "Conor McGregor",     emoji: "🥊", gender: "male" },
  { query: "andrew tate",    terms: ["andrew tate", "tate"],                       label: "Andrew Tate",        emoji: "💎", gender: "male" },
  { query: "lebron james",   terms: ["lebron james", "lebron"],                    label: "LeBron James",       emoji: "🏀", gender: "male" },
  // ── Female celebrities ─────────────────────────────────────────────────────
  { query: "taylor swift",   terms: ["taylor swift", "swift"],                     label: "Taylor Swift",       emoji: "🎸", gender: "female" },
  { query: "beyonce",        terms: ["beyonce", "beyoncé", "queen bey"],           label: "Beyoncé",            emoji: "👑", gender: "female" },
  { query: "oprah winfrey",  terms: ["oprah winfrey", "oprah"],                   label: "Oprah Winfrey",      emoji: "📺", gender: "female" },
  { query: "ariana grande",  terms: ["ariana grande", "ariana"],                  label: "Ariana Grande",      emoji: "🌙", gender: "female" },
  { query: "rihanna",        terms: ["rihanna"],                                   label: "Rihanna",            emoji: "💄", gender: "female" },
  { query: "nicki minaj",    terms: ["nicki minaj", "nicki"],                      label: "Nicki Minaj",        emoji: "🩷", gender: "female" },
  { query: "cardi b",        terms: ["cardi b", "cardi"],                          label: "Cardi B",            emoji: "💅", gender: "female" },
  { query: "lady gaga",      terms: ["lady gaga", "gaga"],                         label: "Lady Gaga",          emoji: "🎭", gender: "female" },
  { query: "adele",          terms: ["adele singer", "adele"],                     label: "Adele",              emoji: "🎶", gender: "female" },
  { query: "kim kardashian", terms: ["kim kardashian", "kardashian"],              label: "Kim Kardashian",     emoji: "🌸", gender: "female" },
  { query: "jennifer lopez", terms: ["jennifer lopez", "jlo"],                     label: "Jennifer Lopez",     emoji: "💃", gender: "female" },
  { query: "scarlett johansson", terms: ["scarlett johansson", "scarlett"],        label: "Scarlett Johansson", emoji: "🎬", gender: "female" },
];

// In-memory cache: query → voice result (null = not found)
const voiceCache = new Map<string, { voiceId: string; name: string } | null>();

async function searchSharedVoice(
  term: string,
  apiKey: string,
): Promise<{ voiceId: string; name: string } | null> {
  try {
    const url = `https://api.elevenlabs.io/v1/shared-voices?search=${encodeURIComponent(term)}&page_size=5`;
    const resp = await fetch(url, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { voices?: Array<{ voice_id: string; name: string; use_case?: string; category?: string }> };
    const first = data.voices?.[0];
    return first ? { voiceId: first.voice_id, name: first.name } : null;
  } catch {
    return null;
  }
}

export async function findCelebrityVoice(
  query: string,
  altTerms: string[] = [],
): Promise<{ voiceId: string; name: string } | null> {
  if (voiceCache.has(query)) return voiceCache.get(query)!;

  const apiKey = getApiKey();
  const termsToTry = [query, ...altTerms];

  for (const term of termsToTry) {
    const result = await searchSharedVoice(term, apiKey);
    if (result) {
      voiceCache.set(query, result);
      return result;
    }
  }

  voiceCache.set(query, null);
  return null;
}

export async function getCelebrityVoices(): Promise<
  Array<{ voiceId: string; name: string; emoji: string; query: string; gender: string }>
> {
  const results = await Promise.all(
    CELEBRITY_QUERIES.map(async (c) => {
      const voice = await findCelebrityVoice(c.query, c.terms);
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

// ── Text-to-Speech preview ───────────────────────────────────────────────────
export async function previewVoice(voiceId: string): Promise<Buffer> {
  const apiKey = getApiKey();

  const phrase = "Hey, this is how I sound. Pretty convincing, right?";

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: phrase,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.85 },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs TTS failed: ${resp.status} — ${err}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
