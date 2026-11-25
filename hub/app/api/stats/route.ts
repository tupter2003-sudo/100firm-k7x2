import { guard, json } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const counts = await sql<{ kind: string; status: string; n: number }>(
    `select kind, status, count(*)::int as n from records group by kind, status`,
  );
  const sent = await sql<{ n: number }>(
    `select count(*)::int as n from activities where type = 'email_out' and created_at > now() - interval '7 days'`,
  );
  return json({ counts, sentLast7Days: sent[0]?.n ?? 0 });
}
