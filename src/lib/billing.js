import { api } from "./auth";

export function loadBilling() {
  return api("/api/billing");
}

export function saveRequisites(requisites) {
  return api("/api/billing", { method: "PUT", body: JSON.stringify(requisites) });
}

export function setServicePrice(id, price) {
  return api("/api/service-prices", { method: "PUT", body: JSON.stringify({ id, price }) });
}

export function createInvoice(leadId, snapshot) {
  return api("/api/invoices", { method: "POST", body: JSON.stringify({ leadId, snapshot }) });
}

export function getInvoice(id) {
  return api(`/api/invoices/${encodeURIComponent(id)}`);
}

export function updateInvoiceStatus(id, status) {
  return api(`/api/invoices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
