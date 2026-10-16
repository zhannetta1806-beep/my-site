import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createInvoice, loadBilling } from "../lib/billing";
import { useModal } from "../lib/useModal";
import { formatTenge, lineAmountTiyn, prepareInvoice, vatAmountTiyn } from "../lib/pdf/invoiceMath.js";

function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function lineKey() {
  return globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function catalogPrice(serviceId, prices) {
  const value = prices?.[serviceId];
  return value == null || value === "" ? "" : String(value);
}

function contactParts(contact) {
  const text = String(contact || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return { phone: "", email: text, contact: "" };
  const digits = text.replace(/\D/g, "");
  if (/^[+\d][\d\s().-]*$/.test(text) && digits.length >= 10 && digits.length <= 15) {
    return { phone: text, email: "", contact: "" };
  }
  return { phone: "", email: "", contact: text };
}

function draftFromLead(lead, billing, services) {
  const requisites = billing?.requisites || {};
  const prices = billing?.prices || {};
  const titles = Array.isArray(lead?.services) && lead.services.length ? lead.services : [""];
  const customer = contactParts(lead?.contact);
  return {
    executorName: requisites.name || "",
    executorTaxId: requisites.taxId || "",
    address: requisites.address || "",
    actualAddress: "",
    iik: requisites.iik || "",
    bik: requisites.bik || "",
    bank: requisites.bank || "",
    kbe: requisites.kbe || "",
    phone: requisites.phone || "",
    email: requisites.email || "",
    customerName: lead?.name || "",
    customerContact: customer.contact,
    customerTaxId: "",
    customerAddress: "",
    customerPhone: customer.phone,
    customerEmail: customer.email,
    customerIik: "",
    customerBik: "",
    customerBank: "",
    customerKbe: "",
    number: billing?.nextNumber || "",
    date: todayIso(),
    purpose: "",
    signatoryName: requisites.signatoryName || "",
    signatoryTitle: requisites.signatoryTitle || "",
    stampUsed: false,
    stampNote: "",
    vatStatus: requisites.vatStatus === "vat" ? "vat" : "none",
    vatRate: requisites.vatStatus === "vat" ? requisites.vatRate || "" : "",
    lines: titles.map((title) => {
      const service = services.find((item) => item.title === title);
      return {
        key: lineKey(),
        serviceId: service?.id || "",
        title,
        quantity: "1",
        price: service ? catalogPrice(service.id, prices) : "",
      };
    }),
  };
}

export function InvoiceForm({ lead, services = [], onClose, onSaved }) {
  const panelRef = useModal(true, onClose);
  const [draft, setDraft] = useState(() => draftFromLead(lead, null, services));
  const [prices, setPrices] = useState({});
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState([]);
  const issuesRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (issues.length) issuesRef.current?.scrollIntoView({ block: "nearest" });
  }, [issues]);

  useEffect(() => {
    document.documentElement.classList.add("request-open");
    return () => document.documentElement.classList.remove("request-open");
  }, []);

  useEffect(() => {
    let active = true;
    loadBilling()
      .then((data) => {
        if (!active) return;
        setPrices(data?.prices || {});
        setDraft(draftFromLead(lead, data, services));
      })
      .catch(() => {
        if (!active) return;
        setStatus("Реквизиты не загрузились. Заполните счёт вручную. Сохранение появится после перезапуска python server.py.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [lead, services]);

  const setField = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const setLine = (key, patch) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  };

  const chooseService = (key, serviceId) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) {
      setLine(key, { serviceId: "" });
      return;
    }
    setLine(key, { serviceId: service.id, title: service.title, price: catalogPrice(service.id, prices) });
  };

  const amounts = draft.lines.map((line) => lineAmountTiyn(line.quantity, line.price));
  const linesReady = amounts.length > 0 && amounts.every((amount) => amount != null);
  const netTiyn = linesReady ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
  const vatTiyn = draft.vatStatus === "vat" && netTiyn != null ? vatAmountTiyn(netTiyn, draft.vatRate) : 0;
  const totalText = (() => {
    if (netTiyn == null) return "Итог появится, когда во всех позициях будут количество и цена.";
    if (draft.vatStatus !== "vat") return `К оплате ${formatTenge(netTiyn)} тенге. НДС не выделяется.`;
    if (vatTiyn == null) return `Сумма ${formatTenge(netTiyn)} тенге. Укажите ставку НДС.`;
    return `Сумма ${formatTenge(netTiyn)} тенге, НДС ${formatTenge(vatTiyn)} тенге, к оплате ${formatTenge(netTiyn + vatTiyn)} тенге.`;
  })();

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setStatus("");
    setIssues([]);
    const prepared = prepareInvoice(draft);
    if (!prepared.ok) {
      const messages = prepared.errors?.length ? prepared.errors : [prepared.message];
      setIssues(messages);
      const field = event.currentTarget.elements.namedItem(prepared.field);
      if (field && typeof field.focus === "function") field.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    try {
      const saved = await createInvoice(lead?.id, { ...prepared.invoice, date: draft.date });
      onSaved?.();
      if (saved?.nextNumber) setField("number", saved.nextNumber);
      try {
        const { downloadStoredInvoice } = await import("../lib/pdf/invoicePdf.js");
        await downloadStoredInvoice(saved?.invoice?.snapshot);
        setStatus("Счёт сохранён в заявке и скачан.");
      } catch (error) {
        if (error?.code === "busy") setStatus("Счёт сохранён. Подождите и скачайте его из истории заявки.");
        else if (error?.code === "font") setStatus("Счёт сохранён. Не удалось загрузить шрифт для PDF.");
        else setStatus("Счёт сохранён в заявке. Скачайте его ещё раз из истории.");
      }
    } catch (error) {
      if (error?.status === 409) {
        setStatus(error.message || "Счёт с таким номером уже есть.");
        if (error.payload?.nextNumber) setField("number", error.payload.nextNumber);
      } else if (error?.status === 404) {
        setStatus(error.message && error.message !== "404"
          ? error.message
          : "Сохранение счёта недоступно. Перезапустите python server.py и повторите.");
      } else if (error?.message && error.message !== String(error.status)) {
        setStatus(error.message);
      } else {
        setStatus("Не удалось сохранить счёт. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="request-modal invoice-modal" ref={panelRef}>
      <div className="request-modal__backdrop" onClick={onClose} />
      <div className="request-modal__panel" role="dialog" aria-modal="true" aria-labelledby="invoice-title">
        <div className="request-modal__head">
          <div>
            <h2 id="invoice-title">Счёт на оплату</h2>
            <p>Реквизиты исполнителя берутся из раздела «Мои реквизиты». Телефон или почта заказчика подставляются из заявки, если контакт записан в таком виде. Цены берутся из каталога: пустая цена заполняется вручную и прайс не меняет.</p>
          </div>
          <button className="btn btn--tiny btn--ghost" type="button" onClick={onClose}>Закрыть</button>
        </div>
        {ready ? (
          <form className="invoice-form" noValidate onSubmit={onSubmit}>
            <div className="invoice-grid">
              <fieldset className="invoice-party">
                <legend>Исполнитель</legend>
                <label className="field">
                  <span>Наименование</span>
                  <input name="executorName" value={draft.executorName} data-initial-focus required maxLength={180} autoComplete="organization" onChange={(event) => setField("executorName", event.target.value)} placeholder="ИП, ТОО или другой статус" />
                </label>
                <label className="field">
                  <span>ИИН/БИН</span>
                  <input name="executorTaxId" value={draft.executorTaxId} inputMode="numeric" maxLength={20} autoComplete="off" onChange={(event) => setField("executorTaxId", event.target.value)} placeholder="12 цифр, если есть" />
                </label>
                <label className="field">
                  <span>Юридический адрес</span>
                  <textarea name="address" rows={2} value={draft.address} maxLength={240} autoComplete="street-address" onChange={(event) => setField("address", event.target.value)} />
                </label>
                <label className="field">
                  <span>Фактический адрес</span>
                  <textarea name="actualAddress" rows={2} value={draft.actualAddress} maxLength={240} onChange={(event) => setField("actualAddress", event.target.value)} placeholder="Если отличается от юридического" />
                </label>
                <label className="field">
                  <span>ИИК</span>
                  <input name="iik" value={draft.iik} maxLength={34} autoComplete="off" onChange={(event) => setField("iik", event.target.value)} placeholder="KZ и ещё 18 символов" />
                </label>
                <label className="field">
                  <span>БИК</span>
                  <input name="bik" value={draft.bik} maxLength={20} autoComplete="off" onChange={(event) => setField("bik", event.target.value)} placeholder="8 или 11 символов" />
                </label>
                <label className="field">
                  <span>Банк</span>
                  <input name="bank" value={draft.bank} maxLength={160} autoComplete="off" onChange={(event) => setField("bank", event.target.value)} />
                </label>
                <label className="field">
                  <span>КБе</span>
                  <input name="kbe" value={draft.kbe} inputMode="numeric" maxLength={10} autoComplete="off" onChange={(event) => setField("kbe", event.target.value)} placeholder="Две цифры" />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input name="phone" type="tel" value={draft.phone} maxLength={40} autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} placeholder="+7 777 000-00-00" />
                </label>
                <label className="field">
                  <span>Почта</span>
                  <input name="email" type="email" value={draft.email} maxLength={80} autoComplete="email" onChange={(event) => setField("email", event.target.value)} placeholder="name@domain.kz" />
                </label>
                <label className="field">
                  <span>Налоговый статус</span>
                  <select name="vatStatus" value={draft.vatStatus} onChange={(event) => setField("vatStatus", event.target.value)}>
                    <option value="none">Не является плательщиком НДС</option>
                    <option value="vat">Плательщик НДС</option>
                  </select>
                </label>
                {draft.vatStatus === "vat" ? (
                  <label className="field">
                    <span>Ставка НДС, %</span>
                    <input name="vatRate" value={draft.vatRate} inputMode="decimal" maxLength={20} onChange={(event) => setField("vatRate", event.target.value)} placeholder="Ставка по вашему статусу" />
                  </label>
                ) : null}
              </fieldset>
              <fieldset className="invoice-party">
                <legend>Заказчик</legend>
                <label className="field">
                  <span>ФИО или организация</span>
                  <input name="customerName" value={draft.customerName} required maxLength={180} autoComplete="name" onChange={(event) => setField("customerName", event.target.value)} />
                </label>
                <label className="field">
                  <span>ИИН/БИН</span>
                  <input name="customerTaxId" value={draft.customerTaxId} inputMode="numeric" maxLength={20} autoComplete="off" onChange={(event) => setField("customerTaxId", event.target.value)} placeholder="12 цифр, если есть" />
                </label>
                <label className="field">
                  <span>Юридический адрес</span>
                  <textarea name="customerAddress" rows={2} value={draft.customerAddress} maxLength={240} onChange={(event) => setField("customerAddress", event.target.value)} />
                </label>
                <label className="field">
                  <span>Контактное лицо</span>
                  <input name="customerContact" value={draft.customerContact} maxLength={160} autoComplete="name" onChange={(event) => setField("customerContact", event.target.value)} />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input name="customerPhone" type="tel" value={draft.customerPhone} maxLength={40} autoComplete="tel" onChange={(event) => setField("customerPhone", event.target.value)} placeholder="+7 777 000-00-00" />
                </label>
                <label className="field">
                  <span>Почта</span>
                  <input name="customerEmail" type="email" value={draft.customerEmail} maxLength={80} autoComplete="email" onChange={(event) => setField("customerEmail", event.target.value)} placeholder="name@domain.kz" />
                </label>
                <label className="field">
                  <span>ИИК</span>
                  <input name="customerIik" value={draft.customerIik} maxLength={34} autoComplete="off" onChange={(event) => setField("customerIik", event.target.value)} placeholder="KZ и ещё 18 символов" />
                </label>
                <label className="field">
                  <span>БИК</span>
                  <input name="customerBik" value={draft.customerBik} maxLength={20} autoComplete="off" onChange={(event) => setField("customerBik", event.target.value)} placeholder="8 или 11 символов" />
                </label>
                <label className="field">
                  <span>Банк</span>
                  <input name="customerBank" value={draft.customerBank} maxLength={160} autoComplete="off" onChange={(event) => setField("customerBank", event.target.value)} />
                </label>
                <label className="field">
                  <span>КБе</span>
                  <input name="customerKbe" value={draft.customerKbe} inputMode="numeric" maxLength={10} autoComplete="off" onChange={(event) => setField("customerKbe", event.target.value)} placeholder="Две цифры" />
                </label>
              </fieldset>
              <fieldset className="invoice-party invoice-party--full">
                <legend>Счёт</legend>
                <div className="invoice-party__grid">
                <label className="field">
                  <span>Номер счёта</span>
                  <input name="number" value={draft.number} required maxLength={40} onChange={(event) => setField("number", event.target.value)} />
                </label>
                <label className="field">
                  <span>Дата выставления</span>
                  <input name="date" type="date" value={draft.date} required onChange={(event) => setField("date", event.target.value)} />
                </label>
                <label className="field invoice-span">
                  <span>Назначение платежа</span>
                  <textarea name="purpose" rows={3} value={draft.purpose} maxLength={500} onChange={(event) => setField("purpose", event.target.value)} placeholder="Текст назначения платежа" />
                </label>
                <label className="field">
                  <span>ФИО подписанта</span>
                  <input name="signatoryName" value={draft.signatoryName} maxLength={160} autoComplete="name" onChange={(event) => setField("signatoryName", event.target.value)} />
                </label>
                <label className="field">
                  <span>Должность подписанта</span>
                  <input name="signatoryTitle" value={draft.signatoryTitle} maxLength={160} autoComplete="organization-title" onChange={(event) => setField("signatoryTitle", event.target.value)} />
                </label>
                <label className="invoice-check">
                  <input name="stampUsed" type="checkbox" checked={draft.stampUsed} onChange={(event) => setField("stampUsed", event.target.checked)} />
                  <span>Печать фактически используется</span>
                </label>
                {draft.stampUsed ? (
                  <label className="field invoice-span">
                    <span>Сведения о печати</span>
                    <textarea name="stampNote" rows={2} value={draft.stampNote} maxLength={300} onChange={(event) => setField("stampNote", event.target.value)} placeholder="Что написать рядом с местом для печати" />
                  </label>
                ) : null}
                </div>
              </fieldset>
            </div>
            <div className="invoice-lines">
              {draft.lines.map((line, index) => {
                const amount = lineAmountTiyn(line.quantity, line.price);
                return (
                  <div className="invoice-line" key={line.key}>
                    <label className="field">
                      <span>Из каталога</span>
                      <select value={line.serviceId} onChange={(event) => chooseService(line.key, event.target.value)}>
                        <option value="">Своё название</option>
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>{service.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Услуга {index + 1}</span>
                      <input name={`title-${index}`} value={line.title} maxLength={180} onChange={(event) => setLine(line.key, { title: event.target.value, serviceId: "" })} />
                    </label>
                    <label className="field">
                      <span>Количество</span>
                      <input name={`quantity-${index}`} value={line.quantity} inputMode="decimal" maxLength={20} onChange={(event) => setLine(line.key, { quantity: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>{draft.vatStatus === "vat" ? "Цена без НДС, тенге" : "Цена, тенге"}</span>
                      <input name={`price-${index}`} value={line.price} inputMode="decimal" maxLength={20} onChange={(event) => setLine(line.key, { price: event.target.value })} placeholder={line.serviceId && !line.price ? "В каталоге цена не указана" : ""} />
                    </label>
                    <p className="invoice-line__sum">{amount == null ? "Сумма появится после цены" : `${formatTenge(amount)} тенге`}</p>
                    <button
                      className="btn btn--tiny btn--ghost"
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))}
                    >
                      Удалить
                    </button>
                  </div>
                );
              })}
              <button
                className="btn btn--small btn--ghost"
                type="button"
                name="lines"
                onClick={() => setDraft((current) => ({
                  ...current,
                  lines: [...current.lines, { key: lineKey(), serviceId: "", title: "", quantity: "1", price: "" }],
                }))}
              >
                Добавить позицию
              </button>
            </div>
            <p className="invoice-total">{totalText}</p>
            <p className="invoice-note">Суммы округляются до 0,01 тенге. Изменение цены в этом счёте не меняет каталог.</p>
            {issues.length ? (
              <ul className="invoice-issues" role="alert" ref={issuesRef}>
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            ) : null}
            <p className="request__status" role="status" hidden={!status}>{status}</p>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Сохранение счёта…" : "Сохранить и скачать счёт"}</button>
          </form>
        ) : (
          <p className="invoice-note">Загрузка данных счёта…</p>
        )}
      </div>
    </div>,
    document.body
  );
}
