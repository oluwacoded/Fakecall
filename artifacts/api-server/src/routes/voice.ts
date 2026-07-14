import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  getCelebrityVoices,
  transformVoice,
  VOICE_PRESETS,
} from "../lib/elevenlabs";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /voice/voices
 * Returns base voices + celebrity voices from ElevenLabs shared library.
 */
router.get("/voice/voices", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const base = [
    { voiceId: "natural", name: "Natural", emoji: "🎙", category: "base", query: "natural" },
    { voiceId: VOICE_PRESETS.male, name: "Deep Male", emoji: "👤", category: "base", query: "male" },
    { voiceId: VOICE_PRESETS.female, name: "Soft Female", emoji: "👤", category: "base", query: "female" },
  ];

  try {
    const celebrity = await getCelebrityVoices();
    res.json({
      voices: [
        ...base,
        ...celebrity.map((v) => ({ ...v, category: "celebrity" })),
      ],
    });
  } catch (err) {
    logger.warn({ err }, "Could not fetch celebrity voices, returning base only");
    res.json({ voices: base });
  }
});

/**
 * POST /voice/transform
 * Accepts raw audio buffer (WAV/PCM) + x-voice-id header.
 * Returns transformed audio as MP3.
 */
router.post("/voice/transform", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const voiceId = (req.headers["x-voice-id"] as string) || VOICE_PRESETS.female;

  // Skip ElevenLabs for base pitch-shifted voices — client handles those
  if (voiceId === "natural" || voiceId === "pitch-male" || voiceId === "pitch-female") {
    res.status(204).end();
    return;
  }

  const audioBuffer = req.body as Buffer;
  if (!audioBuffer || audioBuffer.length < 100) {
    res.status(400).json({ error: "Audio data required" });
    return;
  }

  try {
    const transformed = await transformVoice(audioBuffer, voiceId);
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-cache");
    res.send(transformed);
  } catch (err: any) {
    logger.error({ err, voiceId }, "Voice transform failed");
    res.status(502).json({
      error: "Voice transformation failed",
      detail: err?.message,
    });
  }
});

export default router;
