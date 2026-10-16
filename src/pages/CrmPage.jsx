import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "../components/AdminGate";
import { Header } from "../components/Header";
import { InvoiceForm } from "../components/InvoiceForm";
import { getInvoice, updateInvoiceStatus } from "../lib/billing";
import { listLeads, removeLead, updateLead } from "../lib/leads";
import { formatTenge } from "../lib/pdf/invoiceMath.js";
import { useSite } from "../context/SiteContext";
import { WA_NUMBER } from "../lib/site";
import { usePageMeta } from "../lib/usePageMeta";

const labels = { new: "Новая", work: "В работе", done: "Закрыта" };

function ruLeads(amount) {
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} заявка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${amount} заявки`;
  return `${amount} заявок`;
}

function when(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function whatsappText(lead) {
  const lines = ["Здравствуйте! Заявка с сайта."];
  if (lead.services.length) {
    lines.push("", "Услуги:");
    for (const title of lead.services) lines.push(`— ${title}`);
  }
  lines.push("", `Имя: ${lead.name}`, `Контакт: ${lead.contact}`, `Объект: ${lead.object}`, "", lead.message);
  return lines.join("\n");
}

function CrmWorkspace() {
  const { services } = useSite();
  const [leads, setLeads] = useState([]);
  const [source, setSource] = useState("db");
  const [filter, setFilter] = useState("all");
  const [pdfTask, setPdfTask] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [invoiceLead, setInvoiceLead] = useState(null);
  usePageMeta("Заявки — CRM", "noindex");

  const load = useCallback(async () => {
    const data = await listLeads();
    setLeads(data.leads);
    setSource(data.source);
  }, []);

  useEffect(() => {
    let ignore = false;
    listLeads().then((data) => {
      if (ignore) return;
      setLeads(data.leads);
      setSource(data.source);
    });
    const onFocus = () => {
      if (!ignore) load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      ignore = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const shown = filter === "all" ? leads : leads.filter((lead) => lead.status === filter);
  const fresh = leads.filter((lead) => lead.status === "new").length;
  const filterLabels = { all: "Все", new: "Новые", work: "В работе", done: "Закрытые" };

  const exportPdf = async (task, run) => {
    if (pdfTask) return;
    setPdfTask(task);
    setPdfStatus("");
    try {
      await run();
    } catch (error) {
      if (error?.code === "busy") return;
      if (error?.code === "empty") {
        setPdfStatus(filter === "all"
          ? "Заявок пока нет, поэтому реестр не создан."
          : "В этом фильтре заявок нет, поэтому файл не создан.");
        return;
      }
      if (error?.code === "font") {
        setPdfStatus("Не удалось загрузить шрифт для PDF.");
        return;
      }
      setPdfStatus("Не удалось сформировать PDF. Попробуйте ещё раз.");
    } finally {
      setPdfTask("");
    }
  };

  const changeStatus = async (lead, status) => {
    if (!(await updateLead(lead.id, { status }))) return;
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status } : item)));
  };

  const changeNote = async (lead, note) => {
    if (note === lead.note) return;
    if (await updateLead(lead.id, { note })) {
      setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, note: note.trim() } : item)));
    }
  };

  const changeInvoiceStatus = async (invoice, status) => {
    try {
      await updateInvoiceStatus(invoice.id, status);
    } catch {
      setPdfStatus("Не удалось обновить статус счёта.");
      return;
    }
    setLeads((current) => current.map((lead) => ({
      ...lead,
      invoices: lead.invoices?.map((item) => (item.id === invoice.id ? { ...item, status } : item)),
    })));
  };

  const openStoredInvoice = async (id) => {
    const data = await getInvoice(id);
    const { downloadStoredInvoice } = await import("../lib/pdf/invoicePdf.js");
    await downloadStoredInvoice(data?.invoice?.snapshot);
  };

  const remove = async (lead) => {
    if (!window.confirm(`Удалить заявку от ${lead.name}?`)) return;
    if (!(await removeLead(lead.id))) return;
    setLeads((current) => current.filter((item) => item.id !== lead.id));
  };

  return (
    <>
      <a className="skip" href="#main">Перейти к содержанию</a>
      <Header kind="crm" />
      <main className="section admin" id="main">
        <div className="wrap">
          <header className="section__head">
            <h1>Заявки</h1>
            <p className="section__lead">
              Когда клиент оформляет услугу, перед переходом в WhatsApp сюда сохраняются имя, телефон и состав заказа.
            </p>
          </header>
          <div className="crm-bar">
            <p>{fresh ? `${ruLeads(leads.length)}, новых: ${fresh}` : ruLeads(leads.length)}</p>
            <div className="crm-filters">
              {[
                ["all", "Все"],
                ["new", "Новые"],
                ["work", "В работе"],
                ["done", "Закрытые"],
              ].map(([value, label]) => (
                <button key={value} type="button" className={filter === value ? "is-active" : undefined} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn btn--small btn--ghost"
              type="button"
              disabled={Boolean(pdfTask)}
              onClick={() => exportPdf("report", async () => {
                const { downloadLeadsReport } = await import("../lib/pdf/leadsReportPdf.js");
                await downloadLeadsReport(shown, filterLabels[filter]);
              })}
            >
              {pdfTask === "report" ? "Формирование PDF…" : "Экспорт в PDF"}
            </button>
          </div>
          <p className="request__status" role="status" hidden={!pdfStatus}>{pdfStatus}</p>
          <p className="crm-source">
            {source === "db"
              ? "Заявки хранятся в базе data/crm.sqlite на этом компьютере, вместе с услугами."
              : "Список заявок сейчас недоступен. Запустите python server.py и обновите страницу."}
          </p>
          <p className="services-empty" hidden={shown.length > 0}>
            {leads.length === 0
              ? "Заказов пока нет. Они появятся здесь, когда клиент оформит услугу на сайте."
              : "В этом статусе заявок нет."}
          </p>
          <div className="crm-list">
            {shown.map((lead) => (
              <article className={`crm-card crm-card--${lead.status}`} key={lead.id}>
                <div className="crm-card__head">
                  <div>
                    <h2>{lead.name}</h2>
                    <p>{[when(lead.createdAt), lead.contact, lead.object].filter(Boolean).join(" · ")}</p>
                  </div>
                  <select aria-label={`Статус заявки ${lead.name}`} value={lead.status} onChange={(event) => changeStatus(lead, event.target.value)}>
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <p className="crm-card__message">{lead.message}</p>
                {lead.services.length ? (
                  <ul className="crm-card__services">
                    {lead.services.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                ) : null}
                <label className="field">
                  <span>Заметка</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    defaultValue={lead.note}
                    placeholder="Что уже сделали по этой заявке"
                    key={`${lead.id}-${lead.note}`}
                    onBlur={(event) => changeNote(lead, event.target.value)}
                  />
                </label>
                {lead.invoices?.length ? (
                  <ul className="crm-invoices">
                    {lead.invoices.map((invoice) => (
                      <li className="crm-invoice" key={invoice.id}>
                        <strong>Счёт № {invoice.number}</strong>
                        <span>{invoice.issuedOn}</span>
                        <span>{formatTenge(invoice.totalTiyn)} тенге</span>
                        <select aria-label={`Оплата счёта ${invoice.number}`} value={invoice.status} onChange={(event) => changeInvoiceStatus(invoice, event.target.value)}>
                          <option value="unpaid">Не оплачен</option>
                          <option value="paid">Оплачен</option>
                        </select>
                        <button className="btn btn--tiny btn--ghost" type="button" disabled={Boolean(pdfTask)} onClick={() => exportPdf(invoice.id, () => openStoredInvoice(invoice.id))}>
                          {pdfTask === invoice.id ? "Формирование PDF…" : "Скачать снова"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="crm-card__actions">
                  <button className="btn btn--small" type="button" onClick={() => setInvoiceLead(lead)}>
                    Сформировать счёт
                  </button>
                  <button
                    className="btn btn--small btn--ghost"
                    type="button"
                    disabled={Boolean(pdfTask)}
                    onClick={() => exportPdf(lead.id, async () => {
                      const { downloadLeadPdf } = await import("../lib/pdf/leadPdf.js");
                      await downloadLeadPdf(lead);
                    })}
                  >
                    {pdfTask === lead.id ? "Формирование PDF…" : "Скачать PDF"}
                  </button>
                  <a className="btn btn--small btn--wa" href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(whatsappText(lead))}`} target="_blank" rel="noopener noreferrer">
                    Открыть в WhatsApp
                  </a>
                  <button className="btn btn--small btn--ghost" type="button" onClick={() => remove(lead)}>Удалить</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      {invoiceLead ? (
        <InvoiceForm
          lead={invoiceLead}
          services={services}
          onClose={() => setInvoiceLead(null)}
          onSaved={load}
        />
      ) : null}
    </>
  );
}

export function CrmPage() {
  return (
    <AdminGate kind="crm" title="Заявки — CRM">
      <CrmWorkspace />
    </AdminGate>
  );
}
