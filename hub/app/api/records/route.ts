import { guard, json } from "@/lib/auth";
import { sql } from "@/lib/db";
import { LIST_COLUMNS, cleanPatch, isKind, validStatus } from "@/lib/records";
import { KINDS } from "@/lib/schema";

export async function GET(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const kind = new URL(request.url).searchParams.get("kind");
  const rows = isKind(kind)
    ? await sql(`select ${LIST_COLUMNS} from records r where r.kind = $1 order by r.id`, [kind])
    : await sql(`select ${LIST_COLUMNS} from records r order by r.id`);
  return json({ records: rows });
}

export async function POST(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (!isKind(body.kind)) return json({ error: "bad kind" }, 400);
  const kind = body.kind;
  const { fields, error } = cleanPatch(body);
  if (error) return json({ error }, 400);
  if (typeof fields.name !== "string" || fields.name === "") return json({ error: "name required" }, 400);
  const status = typeof fields.status === "string" ? fields.status : KINDS[kind].statuses[0].key;
  if (!validStatus(kind, status)) return json({ error: "bad status" }, 400);
  fields.status = status;

  const keys = Object.keys(fields);
  const cols = ["kind", "created_by", ...keys];
  const values = [kind, g.who, ...keys.map((k) => fields[k])];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
  const rows = await sql<{ id: number }>(
    `insert into records (${cols.join(",")}) values (${placeholders}) returning id`,
    values,
  );
  const id = rows[0].id;
  await sql(`insert into activities (record_id, type, text, author) values ($1, 'created', $2, $3)`, [
    id,
    "Запись создана",
    g.who,
  ]);
  return json({ id }, 201);
}
