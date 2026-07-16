import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  getCelebrityVoices,
  CELEBRITY_QUERIES,
  transformVoice,
  previewVoice,
  BASE_VOICES,
} from "../lib/elevenlabs";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /voice/voices
 * Returns base voices + celebrity voices (male & female) from ElevenLabs.
 * Auth required (voice transform costs API credits).
 */
router.get("/voice/voices", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const celebrity = await getCelebrityVoices();

    // If ElevenLabs search returned fewer voices than expected, fill in
    // name/emoji placeholders so the UI always shows the full list.
    const foundIds = new Set(celebrity.map((v) => v.query));
    const placeholders = CELEBRITY_QUERIES.filter((q) => !foundIds.has(q.query)).map((q) => ({
      voiceId: `pending:${q.query}`,
      name: q.label,
      emoji: q.emoji,
      query: q.query,
      gender: q.gender,
      pending: true,
    }));

    res.json({
      voices: [
        ...BASE_VOICES,
        ...celebrity.map((v) => ({ ...v, category: "celebrity" })),
        ...placeholders.map((v) => ({ ...v, category: "celebrity" })),
      ],
    });
  } catch (err) {
    logger.warn({ err }, "Could not fetch celebrity voices, returning base only");
    res.json({ voices: BASE_VOICES });
  }
});

/**
 * GET /voice/preview/:voiceId
 * Returns a short MP3 sample of the voice saying a fixed phrase via TTS.
 */
router.get("/voice/preview/:voiceId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { voiceId } = req.params;
  if (!voiceId || voiceId === "natural") {
    res.status(400).json({ error: "No preview for natural voice" });
    return;
  }

  try {
    const audio = await previewVoice(voiceId);
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=86400"); // cache 24h — voice doesn't change
    res.send(audio);
  } catch (err: any) {
    logger.error({ err, voiceId }, "Voice preview failed");
    res.status(502).json({ error: "Preview failed", detail: err?.message });
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
