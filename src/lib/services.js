import { api as request } from "./auth";

const key = "sanexpert-services";

const defaults = [
  {
    id: "audit",
    title: "Санитарный аудит объекта",
    description:
      "Прихожу и смотрю на объект как инспектор: помещения, оборудование, потоки, хранение, документы.",
    result: "Письменный список замечаний и что с каждым делать",
  },
  {
    id: "inspection",
    title: "Подготовка к проверке СЭС",
    description: "Приводим в порядок документы и журналы, разбираем, что и как показывать инспектору.",
    result: "Спокойная проверка без сюрпризов",
  },
  {
    id: "control",
    title: "Производственный контроль",
    description: "Составлю программу производственного контроля под ваш объект и объясню, как её выполнять.",
    result: "Программа и график лабораторных исследований",
  },
  {
    id: "outbreak",
    title: "Документация, необходимая при проверках",
    description: "Разберу, какие документы, журналы и договоры должны быть готовы к проверке на вашем объекте.",
    result: "Перечень документов и что проверить в каждом",
  },
  {
    id: "consult",
    title: "Консультация и разбор предписания",
    description: "Разберу предписание или спорный вопрос по санитарным нормам пункт за пунктом.",
    result: "Ясный ответ и следующий шаг",
  },
  {
    id: "opening",
    title: "Открытие нового объекта",
    description: "Кафе, салон, детский центр, склад — подскажу, какие требования учесть ещё до ремонта.",
    result: "Перечень требований до того, как вложены деньги",
  },
];

const previousTitle = "Если на объекте заболели люди";
const previousDescription = "Порядок действий, дезинфекция, работа с контактными. Без паники и лишних мер.";
const previousResult = "Понятный план действий на первые сутки";

export function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function defaultServices() {
  return defaults.map((item) => ({ ...item }));
}

function normalize(item) {
  if (!item || typeof item !== "object") return null;
  const title = String(item.title || "").trim();
  if (!title) return null;
  return {
    id: String(item.id || createId()),
    title,
    description: String(item.description || "").trim(),
    result: String(item.result || "").trim(),
  };
}

function rename(services) {
  const replacement = defaults.find((service) => service.id === "outbreak");
  return services.map((item) => {
    if (item.title !== previousTitle) return item;
    return {
      ...item,
      title: replacement.title,
      description: item.description === previousDescription ? replacement.description : item.description,
      result: item.result === previousResult ? replacement.result : item.result,
    };
  });
}

function readLocal() {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return rename(data.map(normalize).filter(Boolean));
  } catch {
    return null;
  }
}

export function peekServices() {
  const stored = readLocal();
  return stored?.length ? stored : null;
}

function clearLocal() {
  try {
    localStorage.removeItem(key);
  } catch {
    /* браузер может запретить доступ к хранилищу */
  }
}

function fromPayload(data) {
  return Array.isArray(data?.services) ? data.services.map(normalize).filter(Boolean) : [];
}

let loading = null;

async function loadOnce() {
  const local = peekServices();
  try {
    const data = await request("/api/services");
    const services = fromPayload(data);
    clearLocal();
    if (services.length || data?.source === "custom") return services;
    return defaultServices();
  } catch {
    return local?.length ? local : defaultServices();
  }
}

export function loadServices() {
  if (!loading) {
    loading = loadOnce().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export async function saveServices(services) {
  const next = services.map(normalize).filter(Boolean);
  const saved = await request("/api/services", {
    method: "PUT",
    body: JSON.stringify({ services: next }),
  });
  const list = fromPayload(saved);
  clearLocal();
  return list;
}

export const ServicesStore = {
  createId,
};
