import { guard, json } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cleanPatch, getRecord, validStatus } from "@/lib/records";
import { statusOf, type Kind } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const id = await parseId(ctx);
  if (!id) return json({ error: "bad id" }, 400);
  const record = await getRecord(id);
  if (!record) return json({ error: "not found" }, 404);
  const activities = await sql(
    `select id, record_id, type, text, author, created_at from activities where record_id = $1 order by created_at desc, id desc limit 300`,
    [id],
  );
  return json({ record, activities });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const id = await parseId(ctx);
  if (!id) return json({ error: "bad id" }, 400);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const existing = await sql<{ kind: Kind; status: string }>(`select kind, status from records where id = $1`, [id]);
  if (!existing[0]) return json({ error: "not found" }, 404);
  const { kind, status: oldStatus } = existing[0];

  const { fields, error } = cleanPatch(body);
  if (error) return json({ error }, 400);
  if ("name" in fields && fields.name === "") return json({ error: "name required" }, 400);
  if ("status" in fields && !validStatus(kind, String(fields.status))) return json({ error: "bad status" }, 400);
  const keys = Object.keys(fields);
  if (keys.length === 0) return json({ error: "nothing to update" }, 400);

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await sql(`update records set ${sets}, updated_at = now() where id = $1`, [id, ...keys.map((k) => fields[k])]);

  if (typeof fields.status === "string" && fields.status !== oldStatus) {
    await sql(`insert into activities (record_id, type, text, author) values ($1, 'status', $2, $3)`, [
      id,
      `${statusOf(kind, oldStatus).label} → ${statusOf(kind, fields.status).label}`,
      g.who,
    ]);
  }
  return json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const id = await parseId(ctx);
  if (!id) return json({ error: "bad id" }, 400);
  await sql(`delete from records where id = $1`, [id]);
  return json({ ok: true });
}
