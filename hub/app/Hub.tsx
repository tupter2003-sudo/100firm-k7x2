"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_TYPES,
  KINDS,
  OWNERS,
  statusOf,
  type Activity,
  type Kind,
  type RecordRow,
} from "@/lib/schema";

const PAGES = "https://tupter2003-sudo.github.io/100firm-k7x2/";
const LINKS = [
  { href: PAGES + "site/", title: "Черновик сайта", note: "Как сейчас выглядит сайт AV UniPlast" },
  { href: PAGES, title: "100 компаний для писем", note: "Большой список клиентов с готовыми письмами" },
  { href: PAGES + "executors/", title: "Исполнители в Дании", note: "27 компаний, письмо, скрипт звонка" },
  { href: PAGES + "executors/world/", title: "Исполнители в других странах", note: "Украина, Польша, Прибалтика, Чехия" },
  { href: PAGES + "AV-UniPlast-100.xlsx", title: "Excel: 100 компаний", note: "Скачать таблицу" },
  { href: PAGES + "executors/denmark.xlsx", title: "Excel: исполнители Дании", note: "Скачать таблицу" },
];

const TEMPLATE_DA = `Hej,

Mit navn er {name}, og jeg er fra AV UniPlast. Vi er en lille virksomhed, der hjælper andre virksomheder med at få fremstillet mindre plastdele og reservedele i små mængder.

Vi leder efter faste samarbejdspartnere til den slags opgaver og vil gerne vide:

1. Tager I enkeltstykker og små mængder (fx 1 til 100 stk.)? Er der et minimum pr. ordre?
2. Hvilke plasttyper arbejder I mest med (fx PA, POM, PE, PTFE)?
3. Kan I give en pris ud fra en tegning, et billede med mål eller en prøve?
4. Er det i orden, at vi sender opgaver videre fra vores kunder, og hvordan kan vi bedst arbejde sammen?

Vi har ikke en konkret ordre i dag. Når der kommer en passende forespørgsel, sender vi en tegning eller et billede.

Venlig hilsen
{name}
AV UniPlast
{email}`;

const TEMPLATE_EN = `Hello,

My name is {name}. I work with AV UniPlast, a small Danish company that arranges small plastic parts and spare parts in small quantities for industrial companies.

We are looking for reliable partners for this kind of work. Could you tell us:

1. Do you take orders for single pieces or small quantities (for example 1 to 100 pieces)? What is your minimum order?
2. Which plastics do you usually work with (for example PA, POM, PE, PTFE)?
3. Can you quote from a drawing, a photo with measurements or a sample?
4. How do you usually ship to Denmark, and how do you invoice a Danish company?

We do not have an order to send today. When a suitable request comes in, we will send you a drawing or a photo for a first quote.

Best regards,
{name}
AV UniPlast
{email}`;

type Me = { name: string; email: string; phone: string };
type Tab = "home" | Kind | "feed";
type FeedItem = Activity & { record_name: string; record_kind: Kind };
type Detail = RecordRow & { details: Record<string, unknown> };

async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmt(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  const opt: Intl.DateTimeFormatOptions = withTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short" };
  return d.toLocaleString("ru-RU", opt);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOverdue(r: RecordRow): boolean {
  if (!r.next_date) return false;
  const finished = KINDS[r.kind].statuses.find((s) => s.key === r.status)?.done;
  return !finished && r.next_date <= today();
}

function Badge({ kind, status }: { kind: Kind; status: string }) {
  const s = statusOf(kind, status);
  return (
    <span className="badge" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

function firstEmail(e: string): string {
  return e.split(",")[0].trim();
}

function buildLetter(r: Detail, me: Me): { subject: string; body: string; ru?: string } | null {
  const email = firstEmail(r.email);
  if (!email) return null;
  const fill = (t: string) =>
    t
      .replace(/^([^\n]+)\n/, "$1\n\n")
      .replace(/\n(Med venlig hilsen|Venlig hilsen|С уважением)/, "\n\n$1")
      .replace(/\[Dit navn\]|\[Имя\]/g, me.name || "")
      .replace(/\n\[Telefon\]|\n\[Телефон\]/g, me.phone ? `\n${me.phone}` : "");
  if (r.kind === "client") {
    const d = r.details as { subject_da?: string; body_da?: string; body_ru?: string };
    if (!d.subject_da || !d.body_da) return null;
    return { subject: d.subject_da, body: fill(d.body_da), ru: d.body_ru ? fill(d.body_ru) : undefined };
  }
  if (r.kind === "executor") {
    const da = (r.details as { lang?: string }).lang === "da";
    const tpl = (da ? TEMPLATE_DA : TEMPLATE_EN).replace(/\{name\}/g, me.name || "").replace(/\{email\}/g, me.email || "");
    return { subject: da ? "Samarbejde om små plastdele" : "Small plastic parts: cooperation", body: tpl };
  }
  return null;
}

export default function Hub() {
  const [tab, setTab] = useState<Tab>("home");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [me, setMe] = useState<Me>({ name: "", email: "", phone: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState<Kind | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");

  const say = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        api<{ records: RecordRow[] }>("/api/records"),
        api<{ feed: FeedItem[]; me: { name: string; email: string } }>("/api/feed?limit=60"),
      ]);
      setRecords(r.records);
      setFeed(f.feed);
      setMe((m) => ({ ...m, name: m.name || f.me.name, email: m.email || f.me.email }));
      setFatal("");
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hub_me") || "{}");
      setMe((m) => ({ ...m, ...saved }));
    } catch {
      /* ignore broken saved value */
    }
    reload();
  }, [reload]);

  function saveMe(next: Me) {
    setMe(next);
    localStorage.setItem("hub_me", JSON.stringify(next));
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) c[r.kind] = (c[r.kind] || 0) + 1;
    return c;
  }, [records]);

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            AV <span>UniPlast</span> · рабочая база
          </div>
          <nav className="tabs">
            <button className={`tab ${tab === "home" ? "on" : ""}`} onClick={() => setTab("home")}>
              Главная
            </button>
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                {KINDS[k].label}
                <span className="n">{counts[k] || 0}</span>
              </button>
            ))}
            <button className={`tab ${tab === "feed" ? "on" : ""}`} onClick={() => setTab("feed")}>
              Журнал
            </button>
          </nav>
          <div className="me">{me.name}</div>
        </div>
      </header>

      <main className="wrap">
        {fatal && <div className="ask">Не получилось загрузить данные: {fatal}</div>}
        {loading ? (
          <div className="empty">Загрузка…</div>
        ) : tab === "home" ? (
          <Home records={records} feed={feed} me={me} saveMe={saveMe} open={setOpenId} goto={setTab} />
        ) : tab === "feed" ? (
          <FeedView feed={feed} open={setOpenId} />
        ) : (
          <List
            key={tab}
            kind={tab}
            records={records.filter((r) => r.kind === tab)}
            all={records}
            open={setOpenId}
            create={() => setCreating(tab)}
            reload={reload}
            say={say}
          />
        )}
      </main>

      {openId !== null && (
        <Drawer
          id={openId}
          me={me}
          all={records}
          close={() => setOpenId(null)}
          onChange={reload}
          say={say}
        />
      )}
      {creating && (
        <CreateModal
          kind={creating}
          all={records}
          close={() => setCreating(null)}
          done={async (id) => {
            setCreating(null);
            await reload();
            setOpenId(id);
          }}
          say={say}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function Home({
  records,
  feed,
  me,
  saveMe,
  open,
  goto,
}: {
  records: RecordRow[];
  feed: FeedItem[];
  me: Me;
  saveMe: (m: Me) => void;
  open: (id: number) => void;
  goto: (t: Tab) => void;
}) {
  const attention = records.filter(isOverdue).sort((a, b) => (a.next_date || "").localeCompare(b.next_date || ""));
  const weekAgo = Date.now() - 7 * 86400000;
  const sent = feed.filter((f) => f.type === "email_out" && new Date(f.created_at).getTime() > weekAgo).length;
  const replies = feed.filter((f) => f.type === "email_in" && new Date(f.created_at).getTime() > weekAgo).length;

  return (
    <>
      <h1>Общая страница</h1>
      <p className="sub">Отсюда можно попасть на всё: сайт, списки, и в рабочую базу, где видно, что кому написали и что ответили.</p>

      <div className="grid links">
        {LINKS.map((l) => (
          <a key={l.href} className="link" href={l.href} target="_blank" rel="noopener noreferrer">
            <b>{l.title} ↗</b>
            <small>{l.note}</small>
          </a>
        ))}
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button key={k} className="link" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => goto(k)}>
            <b>База: {KINDS[k].label.toLowerCase()}</b>
            <small>{records.filter((r) => r.kind === k).length} записей</small>
          </button>
        ))}
      </div>

      <div className="cols">
        {(["client", "executor"] as Kind[]).map((k) => {
          const rows = records.filter((r) => r.kind === k);
          return (
            <div className="panel" key={k}>
              <h2>{KINDS[k].label}</h2>
              <div className="big">{rows.length}</div>
              <div className="bar">
                {KINDS[k].statuses.map((s) => {
                  const n = rows.filter((r) => r.status === s.key).length;
                  return n ? <div key={s.key} style={{ width: `${(n / rows.length) * 100}%`, background: s.color }} /> : null;
                })}
              </div>
              <div className="legend">
                {KINDS[k].statuses.map((s) => (
                  <span key={s.key}>
                    <i className="dot" style={{ background: s.color }} />
                    {s.label}: {rows.filter((r) => r.status === s.key).length}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <div className="panel">
          <h2>За 7 дней</h2>
          <div className="row2" style={{ gap: 24 }}>
            <div>
              <div className="big">{sent}</div>
              <small>писем отправлено</small>
            </div>
            <div>
              <div className="big">{replies}</div>
              <small>ответов получено</small>
            </div>
          </div>
          <p className="sub" style={{ margin: "10px 0 0", fontSize: 13 }}>
            Считаются только письма, которые отмечены в базе.
          </p>
        </div>
      </div>

      <div className="cols">
        <div className="panel">
          <h2>Пора вернуться ({attention.length})</h2>
          {attention.length === 0 ? (
            <div className="sub" style={{ margin: 0 }}>Сроков, которые подошли, нет.</div>
          ) : (
            <ul className="feed">
              {attention.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <span className="t warn">{r.next_date}</span>
                  <span className="x">
                    <button className="nm" onClick={() => open(r.id)}>{r.name}</button>
                    <br />
                    {r.next_action}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Последние действия</h2>
          <FeedList feed={feed.filter((f) => f.type !== "created").slice(0, 8)} open={open} />
        </div>
        <div className="panel">
          <h2>Ваши данные для писем</h2>
          <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
            <label>
              Имя в подписи
              <input value={me.name} onChange={(e) => saveMe({ ...me, name: e.target.value })} />
            </label>
            <label>
              Почта в подписи
              <input value={me.email} onChange={(e) => saveMe({ ...me, email: e.target.value })} />
            </label>
            <label>
              Телефон (необязательно)
              <input value={me.phone} onChange={(e) => saveMe({ ...me, phone: e.target.value })} />
            </label>
          </div>
          <small className="sub">Хранится только в этом браузере и подставляется в письма.</small>
        </div>
      </div>
    </>
  );
}

function FeedList({ feed, open }: { feed: FeedItem[]; open: (id: number) => void }) {
  if (feed.length === 0) return <div className="sub" style={{ margin: 0 }}>Пока ничего нет.</div>;
  return (
    <ul className="feed">
      {feed.map((f) => (
        <li key={f.id}>
          <span className="t">{fmt(f.created_at)}</span>
          <span className="x">
            <button className="nm" onClick={() => open(f.record_id)}>{f.record_name}</button>
            <br />
            <b>{ACTIVITY_TYPES[f.type] || f.type}</b>
            {f.text && f.type !== "created" ? `: ${f.text.slice(0, 160)}` : ""} <small style={{ color: "#6b7280" }}>({f.author})</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function FeedView({ feed, open }: { feed: FeedItem[]; open: (id: number) => void }) {
  return (
    <>
      <h1>Журнал</h1>
      <p className="sub">Все действия по всем записям: кто что отправил, кто что ответил, как менялись статусы.</p>
      <div className="panel">
        <FeedList feed={feed} open={open} />
      </div>
    </>
  );
}

function List({
  kind,
  records,
  all,
  open,
  create,
  reload,
  say,
}: {
  kind: Kind;
  records: RecordRow[];
  all: RecordRow[];
  open: (id: number) => void;
  create: () => void;
  reload: () => Promise<void>;
  say: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const def = KINDS[kind];
  const nameById = useMemo(() => new Map(all.map((r) => [r.id, r.name])), [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records
      .filter((r) => (!status || r.status === status) && (!owner || r.owner === owner))
      .filter(
        (r) =>
          !needle ||
          [r.name, r.city, r.country, r.email, r.contact, r.summary, r.notes].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => (a.priority || "Z").localeCompare(b.priority || "Z") || a.id - b.id);
  }, [records, q, status, owner]);

  async function setStatusFor(r: RecordRow, s: string) {
    try {
      await api(`/api/records/${r.id}`, "PATCH", { status: s });
      await reload();
    } catch (e) {
      say(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <>
      <div className="row2" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{def.label}</h1>
        {(kind === "order" || kind === "client" || kind === "executor" || kind === "site") && (
          <button className="btn pri" onClick={create}>
            + Добавить
          </button>
        )}
      </div>
      <div className="chips">
        <button className={`chip ${status === "" ? "on" : ""}`} onClick={() => setStatus("")}>
          Все {records.length}
        </button>
        {def.statuses.map((s) => (
          <button key={s.key} className={`chip ${status === s.key ? "on" : ""}`} onClick={() => setStatus(status === s.key ? "" : s.key)}>
            {s.label} {records.filter((r) => r.status === s.key).length}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Поиск по названию, городу, почте, заметкам" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Все ответственные</option>
          {OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          {records.length === 0 ? (kind === "order" ? "Заказов пока нет. Когда появится первый запрос, добавьте его кнопкой сверху." : "Пока пусто.") : "Ничего не найдено."}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Название</th>
              <th>Статус</th>
              <th className="hide">Ответственный</th>
              <th className="hide">Последнее действие</th>
              <th className="hide">Следующий шаг</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="row" onClick={() => open(r.id)}>
                <td>{r.priority && <span className={`prio ${r.priority}`}>{r.priority}</span>}</td>
                <td>
                  <b>{r.name}</b>
                  <small>
                    {kind === "order"
                      ? [r.link_client_id && nameById.get(r.link_client_id), r.link_executor_id && `исп.: ${nameById.get(r.link_executor_id)}`].filter(Boolean).join(" · ")
                      : [r.city, r.country].filter(Boolean).join(", ")}
                  </small>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    value={r.status}
                    onChange={(e) => setStatusFor(r, e.target.value)}
                    style={{ borderColor: statusOf(kind, r.status).color, padding: "3px 6px", fontSize: 13 }}
                  >
                    {def.statuses.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="hide">{r.owner}</td>
                <td className="hide">
                  {fmt(r.last_activity_at)}
                  {r.activity_count ? <small>записей: {r.activity_count}</small> : null}
                </td>
                <td className="hide">
                  {r.next_date && <span className={isOverdue(r) ? "warn" : ""}>{r.next_date}</span>}
                  {r.next_action && <small>{r.next_action}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Drawer({
  id,
  me,
  all,
  close,
  onChange,
  say,
}: {
  id: number;
  me: Me;
  all: RecordRow[];
  close: () => void;
  onChange: () => Promise<void>;
  say: (m: string) => void;
}) {
  const [rec, setRec] = useState<Detail | null>(null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [asked, setAsked] = useState(false);
  const [showRu, setShowRu] = useState(false);
  const [type, setType] = useState("note");
  const [text, setText] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const load = useCallback(async () => {
    const d = await api<{ record: Detail; activities: Activity[] }>(`/api/records/${id}`);
    setRec(d.record);
    setActs(d.activities);
  }, [id]);

  useEffect(() => {
    setRec(null);
    setAsked(false);
    load().catch((e) => say(e.message));
  }, [load, say]);

  if (!rec) {
    return (
      <>
        <div className="drawer-bg" onClick={close} />
        <aside className="drawer">Загрузка…</aside>
      </>
    );
  }

  const def = KINDS[rec.kind];
  const letter = buildLetter(rec, me);
  const d = rec.details;
  const clients = all.filter((r) => r.kind === "client");
  const executors = all.filter((r) => r.kind === "executor");

  async function patch(fields: Record<string, unknown>) {
    try {
      await api(`/api/records/${id}`, "PATCH", fields);
      await load();
      await onChange();
    } catch (e) {
      say(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function log(t: string, tx: string, st?: string) {
    try {
      await api(`/api/records/${id}/activity`, "POST", { type: t, text: tx, status: st || undefined });
      await load();
      await onChange();
    } catch (e) {
      say(e instanceof Error ? e.message : "Ошибка");
    }
  }

  function openMail() {
    if (!letter || !rec) return;
    const url = `mailto:${firstEmail(rec.email)}?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body.replace(/\n/g, "\r\n"))}`;
    window.location.href = url;
    setAsked(true);
  }

  async function confirmSent() {
    if (!rec || !letter) return;
    const first = rec.kind === "client" ? "email_sent" : "written";
    await log("email_out", `Тема: ${letter.subject}`, rec.status === "new" ? first : undefined);
    setAsked(false);
    say("Записано в журнал");
  }

  async function remove() {
    if (!confirm(`Удалить «${rec?.name}» вместе с историей?`)) return;
    await api(`/api/records/${id}`, "DELETE");
    await onChange();
    close();
  }

  const field = (label: string, key: keyof RecordRow, props: Record<string, unknown> = {}, full = false) => (
    <label className={full ? "full" : ""}>
      {label}
      <input
        defaultValue={String(rec[key] ?? "")}
        key={`${rec.id}-${key}-${rec.updated_at}`}
        onBlur={(e) => e.target.value !== String(rec[key] ?? "") && patch({ [key]: e.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <>
      <div className="drawer-bg" onClick={close} />
      <aside className="drawer">
        <div className="row2" style={{ justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h2>{rec.name}</h2>
            <Badge kind={rec.kind} status={rec.status} />{" "}
            {rec.website && (
              <a href={rec.website} target="_blank" rel="noopener noreferrer">
                сайт ↗
              </a>
            )}
          </div>
          <button className="btn sm" onClick={close}>
            Закрыть
          </button>
        </div>

        {rec.summary && (
          <div className="box">
            <b>{rec.kind === "client" ? "Чем занимаются" : rec.kind === "executor" ? "Что делают" : "Описание"}</b>
            {rec.summary}
          </div>
        )}
        {typeof d.why === "string" && d.why && (
          <div className="box">
            <b>Почему нам подходят</b>
            {d.why}
          </div>
        )}
        {typeof d.give === "string" && d.give && (
          <div className="box">
            <b>Что можем им предложить</b>
            {d.give}
          </div>
        )}
        {typeof d.ask === "string" && d.ask && (
          <div className="box">
            <b>Что уточнить</b>
            {d.ask}
          </div>
        )}
        {typeof d.minq === "string" && d.minq && (
          <div className="box">
            <b>Минимальный заказ</b>
            {d.minq}
          </div>
        )}

        <div className="fields">
          <label>
            Статус
            <select value={rec.status} onChange={(e) => patch({ status: e.target.value })}>
              {def.statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ответственный
            <select value={rec.owner} onChange={(e) => patch({ owner: e.target.value })}>
              <option value="">не назначен</option>
              {OWNERS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          {field("Название", "name", {}, true)}
          {rec.kind !== "site" && field("Почта", "email")}
          {rec.kind !== "site" && field("Телефон", "phone")}
          {rec.kind !== "order" && rec.kind !== "site" && field("Контактное лицо", "contact", {}, true)}
          {rec.kind !== "order" && rec.kind !== "site" && field("Город", "city")}
          {rec.kind !== "order" && rec.kind !== "site" && field("Страна", "country")}
          {rec.kind !== "order" && field("Сайт", "website", {}, true)}
          {rec.kind === "order" && (
            <>
              <label>
                Клиент
                <select value={rec.link_client_id ?? ""} onChange={(e) => patch({ link_client_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">не выбран</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Исполнитель
                <select value={rec.link_executor_id ?? ""} onChange={(e) => patch({ link_executor_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">не выбран</option>
                  {executors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {field("Количество", "qty")}
              {field("Деньги (внутренняя заметка)", "price_note")}
            </>
          )}
          {field("Следующий шаг", "next_action", {}, true)}
          <label>
            Когда вернуться
            <input
              type="date"
              defaultValue={rec.next_date ?? ""}
              key={`${rec.id}-date-${rec.updated_at}`}
              onBlur={(e) => e.target.value !== (rec.next_date ?? "") && patch({ next_date: e.target.value || null })}
            />
          </label>
          <label className="full">
            Заметки
            <textarea
              rows={3}
              defaultValue={rec.notes}
              key={`${rec.id}-notes-${rec.updated_at}`}
              onBlur={(e) => e.target.value !== rec.notes && patch({ notes: e.target.value })}
            />
          </label>
        </div>

        {letter && (
          <>
            <h2>Письмо</h2>
            <div className="row2">
              <button className="btn pri" onClick={openMail}>
                Открыть письмо в почте
              </button>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(`${letter.subject}\n\n${letter.body}`).then(() => say("Скопировано"))}>
                Скопировать текст
              </button>
              {letter.ru && (
                <button className="btn" onClick={() => setShowRu(!showRu)}>
                  {showRu ? "Скрыть перевод" : "Перевод на русский"}
                </button>
              )}
            </div>
            {asked && (
              <div className="ask">
                <span>Вы отправили это письмо?</span>
                <button className="btn sm pri" onClick={confirmSent}>
                  Да, записать
                </button>
                <button className="btn sm" onClick={() => setAsked(false)}>
                  Нет
                </button>
              </div>
            )}
            <div className="letter">
              <b>{letter.subject}</b>
              {"\n\n"}
              {letter.body}
            </div>
            {showRu && letter.ru && <div className="letter" style={{ background: "#fafafa" }}>{letter.ru}</div>}
          </>
        )}

        <h2 style={{ marginTop: 18 }}>История</h2>
        <div className="row2">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ACTIVITY_TYPES)
              .filter(([k]) => k !== "status" && k !== "created")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="">статус не менять</option>
            {def.statuses.map((s) => (
              <option key={s.key} value={s.key}>
                статус: {s.label}
              </option>
            ))}
          </select>
        </div>
        <textarea rows={2} placeholder="Что произошло. Например: ответили, что от 10 штук, цена за штуку 40 крон" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row2">
          <button
            className="btn pri"
            disabled={!text.trim()}
            onClick={async () => {
              await log(type, text, newStatus);
              setText("");
              setNewStatus("");
            }}
          >
            Записать
          </button>
        </div>
        <ul className="tl">
          {acts.map((a) => (
            <li key={a.id} className={a.type === "status" ? "st" : ""}>
              <div className="h">
                {fmt(a.created_at)} · {a.author}
              </div>
              <span className="ty">{ACTIVITY_TYPES[a.type] || a.type}</span>
              {a.text ? `: ${a.text}` : ""}
            </li>
          ))}
        </ul>

        <div className="row2" style={{ marginTop: 20 }}>
          <button className="btn danger sm" onClick={remove}>
            Удалить запись
          </button>
        </div>
      </aside>
    </>
  );
}

function CreateModal({
  kind,
  all,
  close,
  done,
  say,
}: {
  kind: Kind;
  all: RecordRow[];
  close: () => void;
  done: (id: number) => Promise<void>;
  say: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [clientId, setClientId] = useState("");
  const [execId, setExecId] = useState("");
  const [qty, setQty] = useState("");

  async function submit() {
    try {
      const body: Record<string, unknown> = { kind, name, summary, email, website };
      if (kind === "order") {
        body.link_client_id = clientId ? Number(clientId) : null;
        body.link_executor_id = execId ? Number(execId) : null;
        body.qty = qty;
      }
      const r = await api<{ id: number }>("/api/records", "POST", body);
      await done(r.id);
    } catch (e) {
      say(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <>
      <div className="drawer-bg" style={{ zIndex: 30 }} onClick={close} />
      <div className="modal">
        <h2>Новая запись: {KINDS[kind].one}</h2>
        <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
          <label>
            Название
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "order" ? "Например: втулка для GNL" : ""} />
          </label>
          <label>
            Описание
            <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          {kind === "order" && (
            <>
              <label>
                Клиент
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">не выбран</option>
                  {all.filter((r) => r.kind === "client").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Исполнитель
                <select value={execId} onChange={(e) => setExecId(e.target.value)}>
                  <option value="">не выбран</option>
                  {all.filter((r) => r.kind === "executor").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Количество
                <input value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
            </>
          )}
          {(kind === "client" || kind === "executor") && (
            <>
              <label>
                Почта
                <input value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Сайт
                <input value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="row2">
          <button className="btn pri" disabled={!name.trim()} onClick={submit}>
            Создать
          </button>
          <button className="btn" onClick={close}>
            Отмена
          </button>
        </div>
      </div>
    </>
  );
}
