import { useEffect, useState } from "react";
import { AdminGate } from "../components/AdminGate";
import { Header } from "../components/Header";
import { loadBilling, saveRequisites } from "../lib/billing";
import { usePageMeta } from "../lib/usePageMeta";

const empty = {
  name: "",
  taxId: "",
  address: "",
  bank: "",
  iik: "",
  bik: "",
  kbe: "",
  phone: "",
  email: "",
  vatStatus: "none",
  vatRate: "",
  signatoryName: "",
  signatoryTitle: "",
};

function RequisitesWorkspace() {
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  usePageMeta("Мои реквизиты — админка", "noindex");

  useEffect(() => {
    let active = true;
    loadBilling()
      .then((data) => {
        if (!active || !data?.requisites) return;
        setForm({ ...empty, ...data.requisites, vatStatus: data.requisites.vatStatus === "vat" ? "vat" : "none" });
      })
      .catch((error) => {
        if (!active) return;
        setStatus(error?.status === 404
          ? "Раздел появится после перезапуска python server.py."
          : "Не удалось загрузить реквизиты.");
      });
    return () => {
      active = false;
    };
  }, []);

  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const data = await saveRequisites({
        ...form,
        vatRate: form.vatStatus === "vat" ? form.vatRate : "",
      });
      if (data?.requisites) setForm({ ...empty, ...data.requisites });
      setStatus("Реквизиты сохранены. Новые счета подставят их автоматически.");
    } catch (error) {
      setStatus(error?.message && error.message !== String(error.status)
        ? error.message
        : "Не удалось сохранить реквизиты.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <a className="skip" href="#main">Перейти к содержанию</a>
      <Header kind="admin" />
      <main className="section admin" id="main">
        <div className="wrap">
          <header className="section__head">
            <h1>Мои реквизиты</h1>
            <p className="section__lead">
              Эти данные видит только администратор. Они подставляются в новые счета.
              Пустые поля в счёте остаются пустыми.
            </p>
          </header>
          <form className="admin-form" onSubmit={onSubmit}>
            <label className="field">
              <span>Наименование ИП или организации</span>
              <input value={form.name} maxLength={180} autoComplete="organization" onChange={(event) => setField("name", event.target.value)} />
            </label>
            <label className="field">
              <span>ИИН/БИН</span>
              <input value={form.taxId} inputMode="numeric" maxLength={20} autoComplete="off" onChange={(event) => setField("taxId", event.target.value)} placeholder="12 цифр, если есть" />
            </label>
            <label className="field">
              <span>Юридический адрес</span>
              <textarea rows={2} value={form.address} maxLength={240} onChange={(event) => setField("address", event.target.value)} />
            </label>
            <label className="field">
              <span>Наименование банка</span>
              <input value={form.bank} maxLength={160} autoComplete="off" onChange={(event) => setField("bank", event.target.value)} />
            </label>
            <label className="field">
              <span>ИИК (IBAN)</span>
              <input value={form.iik} maxLength={34} autoComplete="off" onChange={(event) => setField("iik", event.target.value)} />
            </label>
            <label className="field">
              <span>БИК</span>
              <input value={form.bik} maxLength={20} autoComplete="off" onChange={(event) => setField("bik", event.target.value)} />
            </label>
            <label className="field">
              <span>КБе</span>
              <input value={form.kbe} maxLength={10} autoComplete="off" onChange={(event) => setField("kbe", event.target.value)} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input value={form.phone} maxLength={40} autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} />
            </label>
            <label className="field">
              <span>Электронная почта</span>
              <input value={form.email} maxLength={80} autoComplete="email" onChange={(event) => setField("email", event.target.value)} />
            </label>
            <label className="field">
              <span>Статус плательщика НДС</span>
              <select value={form.vatStatus} onChange={(event) => setField("vatStatus", event.target.value)}>
                <option value="none">Не является плательщиком НДС</option>
                <option value="vat">Плательщик НДС</option>
              </select>
            </label>
            {form.vatStatus === "vat" ? (
              <label className="field">
                <span>Ставка НДС, %</span>
                <input value={form.vatRate} inputMode="decimal" maxLength={20} onChange={(event) => setField("vatRate", event.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>ФИО подписанта</span>
              <input value={form.signatoryName} maxLength={160} autoComplete="name" onChange={(event) => setField("signatoryName", event.target.value)} />
            </label>
            <label className="field">
              <span>Должность подписанта</span>
              <input value={form.signatoryTitle} maxLength={160} autoComplete="organization-title" onChange={(event) => setField("signatoryTitle", event.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить реквизиты"}</button>
            <p className="request__status" role="status" hidden={!status}>{status}</p>
          </form>
        </div>
      </main>
    </>
  );
}

export function RequisitesPage() {
  return (
    <AdminGate kind="admin" title="Мои реквизиты — админка">
      <RequisitesWorkspace />
    </AdminGate>
  );
}
