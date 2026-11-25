import { requireIdentity, type VerifiedIdentity } from "../../cursor/identity";

export type Guard = { ok: true; who: string; identity: VerifiedIdentity } | { ok: false; response: Response };

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

export async function guard(request: Request): Promise<Guard> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return { ok: false, response: identity };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (originHost !== host) return { ok: false, response: json({ error: "bad origin" }, 403) };
    }
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, response: json({ error: "json required" }, 415) };
    }
  }
  if (identity.appVisibility === "public") {
    return { ok: false, response: json({ error: "the base is not available in a public app" }, 403) };
  }
  const who = (identity.name || identity.email || "user").slice(0, 80);
  return { ok: true, who, identity };
}
