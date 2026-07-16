import { Router } from "express";

const router = Router();

/**
 * POST /shorten
 * Body: { url: string }
 * Returns a TinyURL short link — hides the real domain from recipients.
 */
router.post("/shorten", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const resp = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) throw new Error(`TinyURL returned ${resp.status}`);
    const shortUrl = (await resp.text()).trim();
    if (!shortUrl.startsWith("http")) throw new Error("Invalid response from TinyURL");
    res.json({ shortUrl });
  } catch (err: any) {
    res.status(502).json({ error: "Could not shorten link", detail: err?.message });
  }
});

export default router;
