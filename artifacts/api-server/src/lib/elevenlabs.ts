/**
 * ElevenLabs integration for voice transformation.
 * Fetches credentials from the Replit connection API.
 */
async function getElevenLabsCredentials(): Promise<{ apiKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "ElevenLabs integration not configured. Connect via Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=elevenlabs`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch ElevenLabs credentials: ${resp.status}`);
  }

  const data = await resp.json();
  const settings = data.items?.[0]?.settings;

  if (!settings?.api_key) {
    throw new Error(
      "ElevenLabs integration not connected. Connect via Integrations tab first.",
    );
  }

  return { apiKey: settings.api_key };
}

export async function getElevenLabsVoices() {
  const { apiKey } = await getElevenLabsCredentials();
  const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!resp.ok) {
    throw new Error(`ElevenLabs voices fetch failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data.voices ?? [];
}

export async function transformVoice(
  audioBuffer: Buffer,
  voiceId: string,
  modelId = "eleven_english_sts_v2",
): Promise<Buffer> {
  const { apiKey } = await getElevenLabsCredentials();

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("audio", blob, "audio.mp3");
  formData.append("model_id", modelId);

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs STS failed: ${resp.status} ${err}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Preset voice IDs for male/female switching
export const VOICE_PRESETS = {
  male: "pNInz6obpgDQGcFmaJgB", // Adam (deep male voice)
  female: "EXAVITQu4vr4xnSDxMaL", // Bella (warm female voice)
} as const;
