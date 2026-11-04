/** Shared helpers for the public JSON API: CORS for GET (the browser extension calls these from polymarket.com), client keys. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function apiError(status: number, code: string, error: string, retryAfter?: number): Response {
  return Response.json(
    { ok: false, code, error },
    { status, headers: { ...CORS_HEADERS, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } },
  );
}

/** A successful JSON reply. `maxAge` is how long a CDN may serve it (seconds); 0 for no shared caching. */
export function apiOk(body: Record<string, unknown>, maxAge = 600): Response {
  return Response.json(
    { ok: true, ...body },
    { headers: { ...CORS_HEADERS, "Cache-Control": maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=60` : "no-store" } },
  );
}
