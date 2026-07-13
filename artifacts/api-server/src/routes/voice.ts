import { Router } from "express";
import { getAuth } from "@clerk/express";
import { getElevenLabsVoices, transformVoice, VOICE_PRESETS } from "../lib/elevenlabs";
import { logger } from "../lib/logger";

const router = Router();

// GET /voice/voices — list available ElevenLabs voices
router.get("/voice/voices", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const voices = await getElevenLabsVoices();

    // Filter to useful voices for voice changing
    const mapped = voices
      .filter((v: any) => v.labels?.gender)
      .slice(0, 20)
      .map((v: any) => ({
        voiceId: v.voice_id,
        name: v.name,
        gender: v.labels?.gender ?? "unknown",
        preview: v.preview_url ?? null,
      }));

    // Always include the preset voices
    const presets = [
      {
        voiceId: VOICE_PRESETS.male,
        name: "Male Voice",
        gender: "male",
        preview: null,
      },
      {
        voiceId: VOICE_PRESETS.female,
        name: "Female Voice",
        gender: "female",
        preview: null,
      },
    ];

    res.json({ voices: [...presets, ...mapped] });
  } catch (err) {
    logger.warn({ err }, "ElevenLabs not connected, returning preset voices");
    // Return preset voices even if ElevenLabs not connected
    res.json({
      voices: [
        {
          voiceId: VOICE_PRESETS.male,
          name: "Male Voice",
          gender: "male",
          preview: null,
        },
        {
          voiceId: VOICE_PRESETS.female,
          name: "Female Voice",
          gender: "female",
          preview: null,
        },
      ],
    });
  }
});

// POST /voice/transform — transform audio chunk via ElevenLabs STS
// Accepts: audio file as multipart/form-data, voiceId in body
router.post("/voice/transform", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // The audio buffer comes through as raw body
    const voiceId =
      (req.headers["x-voice-id"] as string) || VOICE_PRESETS.female;
    const audioBuffer = req.body as Buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Audio data required" });
    }

    const transformed = await transformVoice(audioBuffer, voiceId);

    res.set("Content-Type", "audio/mpeg");
    res.send(transformed);
  } catch (err: any) {
    logger.error({ err }, "Voice transform failed");
    res.status(500).json({
      error: "Voice transformation failed",
      detail: err?.message,
    });
  }
});

export default router;
