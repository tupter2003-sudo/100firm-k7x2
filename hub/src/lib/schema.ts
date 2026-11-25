export type Kind = "client" | "executor" | "order" | "site";

export type StatusDef = { key: string; label: string; color: string; done?: boolean };

export const KINDS: Record<Kind, { label: string; one: string; statuses: StatusDef[] }> = {
  client: {
    label: "Клиенты",
    one: "клиент",
    statuses: [
      { key: "new", label: "Не писали", color: "#8a8f98" },
      { key: "email_sent", label: "Письмо отправлено", color: "#2f6fed" },
      { key: "replied", label: "Ответили", color: "#d98a00" },
      { key: "talk", label: "Переговоры", color: "#8b5cf6" },
      { key: "customer", label: "Клиент", color: "#12a150", done: true },
      { key: "bounced", label: "Письмо вернулось", color: "#d9480f" },
      { key: "declined", label: "Отказ", color: "#c0392b", done: true },
    ],
  },
  executor: {
    label: "Исполнители",
    one: "исполнитель",
    statuses: [
      { key: "new", label: "Не писали", color: "#8a8f98" },
      { key: "written", label: "Написали", color: "#2f6fed" },
      { key: "replied", label: "Ответили", color: "#d98a00" },
      { key: "test", label: "Пробный заказ", color: "#8b5cf6" },
      { key: "working", label: "Работаем", color: "#12a150", done: true },
      { key: "declined", label: "Не подходит", color: "#c0392b", done: true },
    ],
  },
  order: {
    label: "Заказы",
    one: "заказ",
    statuses: [
      { key: "request", label: "Запрос от клиента", color: "#8a8f98" },
      { key: "quote", label: "Считает исполнитель", color: "#2f6fed" },
      { key: "offer", label: "Предложение клиенту", color: "#d98a00" },
      { key: "confirmed", label: "Подтверждён", color: "#8b5cf6" },
      { key: "production", label: "Изготовление", color: "#0e7c86" },
      { key: "shipped", label: "Отправлен", color: "#4263eb" },
      { key: "done", label: "Закрыт", color: "#12a150", done: true },
      { key: "cancelled", label: "Отменён", color: "#c0392b", done: true },
    ],
  },
  site: {
    label: "Сайт",
    one: "задача по сайту",
    statuses: [
      { key: "idea", label: "Идея", color: "#8a8f98" },
      { key: "draft", label: "Черновик", color: "#2f6fed" },
      { key: "review", label: "На проверке", color: "#d98a00" },
      { key: "live", label: "Опубликовано", color: "#12a150", done: true },
    ],
  },
};

export const ACTIVITY_TYPES: Record<string, string> = {
  email_out: "Письмо отправлено",
  email_in: "Получен ответ",
  call: "Звонок",
  note: "Заметка",
  task: "Задача",
  status: "Статус",
  created: "Создано",
};

export const OWNERS = ["Artem", "Viktor"];

export type RecordRow = {
  id: number;
  kind: Kind;
  name: string;
  status: string;
  priority: string;
  country: string;
  city: string;
  email: string;
  phone: string;
  website: string;
  contact: string;
  summary: string;
  notes: string;
  owner: string;
  next_action: string;
  next_date: string | null;
  qty: string;
  price_note: string;
  link_client_id: number | null;
  link_executor_id: number | null;
  details?: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_activity_at?: string | null;
  activity_count?: number;
};

export type Activity = {
  id: number;
  record_id: number;
  type: string;
  text: string;
  author: string;
  created_at: string;
  record_name?: string;
  record_kind?: Kind;
};

export function statusOf(kind: Kind, key: string): StatusDef {
  return KINDS[kind].statuses.find((s) => s.key === key) ?? { key, label: key, color: "#8a8f98" };
}
