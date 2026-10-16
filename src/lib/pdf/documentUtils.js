const INVALID_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function pdfError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLongDate(date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cleanText(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

export function safeFilePart(value, fallback) {
  const cleaned = cleanText(value)
    .replace(INVALID_FILE_CHARS, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function shortId(value) {
  const compact = cleanText(value).replace(/[^0-9A-Za-z]/g, "").slice(0, 8);
  return compact || "document";
}

export function excerpt(value, max = 280) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

const STATUS_LABELS = { new: "Новая", work: "В работе", done: "Закрыта" };

export function statusLabel(status) {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  return cleanText(status);
}

export function catalogFileName(date) {
  return `Каталог_услуг_${formatIsoDate(date)}.pdf`;
}

export function serviceFileName(title) {
  return `Услуга_${safeFilePart(title, "услуга")}.pdf`;
}

export function leadFileName(date, id) {
  return `Заявка_${formatIsoDate(date)}_${shortId(id)}.pdf`;
}

export function registryFileName(date) {
  return `Реестр_заявок_${formatIsoDate(date)}.pdf`;
}

export function invoiceFileName(date, id) {
  return `Счёт_${formatIsoDate(date)}_${shortId(id)}.pdf`;
}
