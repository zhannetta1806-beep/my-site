import { api as request } from "./auth";
import { leadFailureText } from "./leadErrors.js";

export { leadFailureText };

const key = "sanexpert-leads";
const limit = 200;
const statuses = new Set(["new", "work", "done"]);

const clean = (value, max) => String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

function normalize(item) {
  if (!item || typeof item !== "object") return null;
  const name = clean(item.name, 120);
  const contact = clean(item.contact, 160);
  const message = String(item.message || "").trim().slice(0, 2000);
  if (!name || !contact || !message) return null;
  const services = Array.isArray(item.services)
    ? item.services.map((title) => clean(title, 160)).filter(Boolean).slice(0, 12)
    : [];
  const invoices = Array.isArray(item.invoices)
    ? item.invoices.map((invoice) => {
      if (!invoice || typeof invoice !== "object") return null;
      const id = clean(invoice.id, 80);
      const number = clean(invoice.number, 40);
      const total = Number(invoice.totalTiyn);
      if (!id || !number || !Number.isInteger(total) || total < 0) return null;
      return {
        id,
        number,
        issuedOn: clean(invoice.issuedOn, 10),
        createdAt: clean(invoice.createdAt, 40),
        status: invoice.status === "paid" ? "paid" : "unpaid",
        totalTiyn: total,
      };
    }).filter(Boolean).slice(0, 50)
    : undefined;
  return {
    id: clean(item.id, 80) || globalThis.crypto?.randomUUID?.() || `lead-${Date.now().toString(36)}`,
    createdAt: clean(item.createdAt || item.created_at, 40) || new Date().toISOString(),
    name,
    contact,
    object: clean(item.object, 160) || "Другое",
    message,
    services,
    status: statuses.has(item.status) ? item.status : "new",
    note: String(item.note || "").trim().slice(0, 1000),
    ...(invoices ? { invoices } : {}),
  };
}

function readLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data.map(normalize).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeLocal(leads) {
  localStorage.setItem(key, JSON.stringify(leads.slice(0, limit)));
}

export async function saveLead(draft) {
  const lead = normalize({
    ...draft,
    id: draft?.id || globalThis.crypto?.randomUUID?.() || `lead-${Date.now().toString(36)}`,
    createdAt: draft?.createdAt || new Date().toISOString(),
    status: "new",
    note: "",
  });
  if (!lead) return { ok: false, where: "", status: 0 };
  try {
    await request("/api/leads", { method: "POST", body: JSON.stringify(lead) });
    return { ok: true, where: "db", id: lead.id };
  } catch (error) {
    return { ok: false, where: "", status: Number(error?.status) || 0, id: lead.id };
  }
}

export async function flushLocalLeads() {
  const local = readLocal();
  if (!local.length) return;
  const left = [];
  for (const item of local) {
    try {
      await request("/api/leads", { method: "POST", body: JSON.stringify(item) });
    } catch {
      left.push(item);
    }
  }
  try {
    if (left.length) writeLocal(left);
    else localStorage.removeItem(key);
  } catch {
    /* локальный запасной список может быть недоступен */
  }
}

export async function listLeads() {
  try {
    await request("/api/leads");
    await flushLocalLeads();
    const data = await request("/api/leads");
    const leads = Array.isArray(data?.leads) ? data.leads.map(normalize).filter(Boolean) : [];
    return { leads, source: "db" };
  } catch (error) {
    const denied = error?.status === 401 || error?.status === 403;
    return { leads: [], source: denied ? "unauthorized" : "offline" };
  }
}

export async function updateLead(id, patch) {
  const next = {};
  if (patch.status) next.status = statuses.has(patch.status) ? patch.status : "new";
  if (typeof patch.note === "string") next.note = patch.note.trim().slice(0, 1000);
  try {
    await request(`/api/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(next) });
    return true;
  } catch {
    return false;
  }
}

export async function removeLead(id) {
  try {
    await request(`/api/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}
