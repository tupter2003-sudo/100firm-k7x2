import { sql } from "./db";
import { KINDS, type Kind } from "./schema";

export const LIST_COLUMNS = `r.id, r.kind, r.name, r.status, r.priority, r.country, r.city, r.email, r.phone,
  r.website, r.contact, r.summary, r.notes, r.owner, r.next_action, to_char(r.next_date, 'YYYY-MM-DD') as next_date,
  r.qty, r.price_note, r.link_client_id, r.link_executor_id, r.created_by, r.created_at, r.updated_at,
  (select max(a.created_at) from activities a where a.record_id = r.id and a.type <> 'status') as last_activity_at,
  (select count(*)::int from activities a where a.record_id = r.id) as activity_count`;

const TEXT_LIMITS: Record<string, number> = {
  name: 200, priority: 4, country: 80, city: 120, email: 200, phone: 60, website: 300, contact: 300,
  summary: 4000, notes: 8000, owner: 40, next_action: 500, qty: 120, price_note: 500,
};

export const EDITABLE = [...Object.keys(TEXT_LIMITS), "status", "next_date", "link_client_id", "link_executor_id"] as const;

export function isKind(v: unknown): v is Kind {
  return typeof v === "string" && v in KINDS;
}

export function validStatus(kind: Kind, status: string): boolean {
  return KINDS[kind].statuses.some((s) => s.key === status);
}

export function cleanPatch(input: Record<string, unknown>): { fields: Record<string, unknown>; error?: string } {
  const fields: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    if (key === "next_date") {
      if (v === null || v === "") fields[key] = null;
      else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) fields[key] = v;
      else return { fields, error: "bad date" };
    } else if (key === "link_client_id" || key === "link_executor_id") {
      if (v === null || v === "") fields[key] = null;
      else if (Number.isInteger(v)) fields[key] = v;
      else return { fields, error: "bad link" };
    } else if (key === "status") {
      if (typeof v !== "string") return { fields, error: "bad status" };
      fields[key] = v;
    } else {
      if (typeof v !== "string") return { fields, error: `bad ${key}` };
      fields[key] = v.trim().slice(0, TEXT_LIMITS[key]);
    }
  }
  return { fields };
}

export async function getRecord(id: number) {
  const rows = await sql<Record<string, unknown>>(
    `select ${LIST_COLUMNS}, r.details from records r where r.id = $1`,
    [id],
  );
  return rows[0];
}
