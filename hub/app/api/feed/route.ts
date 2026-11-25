import { guard, json } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const raw = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 200) : 50;
  const rows = await sql(
    `select a.id, a.record_id, a.type, a.text, a.author, a.created_at, r.name as record_name, r.kind as record_kind
     from activities a join records r on r.id = a.record_id
     order by a.created_at desc, a.id desc limit $1`,
    [limit],
  );
  return json({ feed: rows, me: { name: g.who, email: g.identity.email } });
}
