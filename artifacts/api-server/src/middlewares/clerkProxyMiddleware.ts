import { type Request } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Returns the canonical host Clerk should use for this request.
 * In development, Clerk hits its FAPI directly (no proxy needed).
 * In production, the shared proxy is configured by Replit automatically.
 */
export function getClerkProxyHost(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-host"];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded;
  }
  return req.headers.host ?? null;
}

/**
 * Proxy middleware that forwards /api/__clerk/* to Clerk's FAPI.
 * Mount it BEFORE cors / body parsers — the proxy streams raw bytes.
 */
export function clerkProxyMiddleware() {
  return createProxyMiddleware({
    target: "https://clerk.accounts.dev",
    changeOrigin: true,
    pathRewrite: { [`^${CLERK_PROXY_PATH}`]: "" },
    on: {
      error(err, _req, res: any) {
        console.error("Clerk proxy error:", err);
        if (!res.headersSent) {
          res.status(502).json({ error: "Clerk proxy error" });
        }
      },
    },
  });
}
