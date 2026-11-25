import { guard, json } from "@/lib/auth";
import { sql } from "@/lib/db";
import { validStatus } from "@/lib/records";
import { ACTIVITY_TYPES, statusOf, type Kind } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "bad id" }, 400);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const type = typeof body.type === "string" ? body.type : "";
  if (!(type in ACTIVITY_TYPES) || type === "status" || type === "created") return json({ error: "bad type" }, 400);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (text === "") return json({ error: "text required" }, 400);

  const existing = await sql<{ kind: Kind; status: string }>(`select kind, status from records where id = $1`, [id]);
  if (!existing[0]) return json({ error: "not found" }, 404);
  const { kind, status: oldStatus } = existing[0];

  await sql(`insert into activities (record_id, type, text, author) values ($1, $2, $3, $4)`, [id, type, text, g.who]);
  await sql(`update records set updated_at = now() where id = $1`, [id]);

  const newStatus = typeof body.status === "string" ? body.status : "";
  if (newStatus && newStatus !== oldStatus) {
    if (!validStatus(kind, newStatus)) return json({ error: "bad status" }, 400);
    await sql(`update records set status = $2 where id = $1`, [id, newStatus]);
    await sql(`insert into activities (record_id, type, text, author) values ($1, 'status', $2, $3)`, [
      id,
      `${statusOf(kind, oldStatus).label} → ${statusOf(kind, newStatus).label}`,
      g.who,
    ]);
  }
  return json({ ok: true }, 201);
}
