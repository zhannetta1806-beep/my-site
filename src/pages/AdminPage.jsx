import { useEffect, useState } from "react";
import { AdminGate } from "../components/AdminGate";
import { Header } from "../components/Header";
import { useSite } from "../context/SiteContext";
import { loadBilling, setServicePrice } from "../lib/billing";
import { ServicesStore } from "../lib/services";
import { ruCount } from "../lib/plural";
import { usePageMeta } from "../lib/usePageMeta";

function pdfMessage(error) {
  if (error?.code === "busy") return "";
  if (error?.code === "empty") return "Услуг пока нет, поэтому каталог не сформирован.";
  if (error?.code === "font") return "Не удалось загрузить шрифт для PDF.";
  return "Не удалось сформировать PDF. Попробуйте ещё раз.";
}

function AdminWorkspace() {
  const { services, saveServices } = useSite();
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState("");
  const [price, setPrice] = useState("");
  const [prices, setPrices] = useState({});
  const [pricesReady, setPricesReady] = useState(false);
  const [pdfTask, setPdfTask] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  usePageMeta("Услуги — админка", "noindex");

  const exportPdf = async (task, run) => {
    if (pdfTask) return;
    setPdfTask(task);
    setPdfStatus("");
    try {
      await run();
    } catch (error) {
      const message = pdfMessage(error);
      if (message) setPdfStatus(message);
    } finally {
      setPdfTask("");
    }
  };

  useEffect(() => {
    let active = true;
    setPricesReady(false);
    loadBilling()
      .then((data) => {
        if (!active) return;
        setPrices(data?.prices || {});
        setPricesReady(true);
      })
      .catch(() => {
        if (!active) return;
        setPricesReady(false);
      });
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    if (editingId && !services.some((item) => item.id === editingId)) {
      setEditingId(null);
      setTitle("");
      setDescription("");
      setResult("");
      setPrice("");
    }
  }, [services, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setResult("");
    setPrice("");
  };

  const startEdit = (service) => {
    setEditingId(service.id);
    setTitle(service.title);
    setDescription(service.description);
    setResult(service.result);
    setPrice(prices[service.id] || "");
    setStatus("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const draft = {
      id: editingId || ServicesStore.createId(),
      title: title.trim(),
      description: description.trim(),
      result: result.trim(),
    };
    const next = editingId
      ? services.map((item) => (item.id === editingId ? draft : item))
      : [...services, draft];
    const wasEdit = Boolean(editingId);
    if (!(await saveServices(next))) {
      setStatus("Не удалось сохранить. Откройте сайт через python server.py, чтобы база была доступна.");
      return;
    }
    if (pricesReady) {
      try {
        const savedPrice = await setServicePrice(draft.id, price.trim());
        setPrices((current) => {
          const nextPrices = { ...current };
          if (savedPrice?.price) nextPrices[draft.id] = savedPrice.price;
          else delete nextPrices[draft.id];
          return nextPrices;
        });
      } catch (error) {
        setStatus(error?.message && error.message !== String(error.status)
          ? `Услуга сохранена. Стоимость не записалась: ${error.message}`
          : "Услуга сохранена. Стоимость не записалась — перезапустите python server.py.");
        resetForm();
        return;
      }
    }
    setStatus(
      wasEdit
        ? "Изменения сохранены в базе и уже видны на сайте."
        : "Услуга добавлена и уже есть в блоке «Чем могу помочь»."
    );
    resetForm();
  };

  const move = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= services.length) return;
    const next = services.slice();
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    if (!(await saveServices(next))) {
      setStatus("Не удалось сохранить. Откройте сайт через python server.py, чтобы база была доступна.");
    }
  };

  const remove = async (service) => {
    if (!window.confirm(`Удалить услугу «${service.title}»? На сайте её тоже не будет.`)) return;
    const next = services.filter((item) => item.id !== service.id);
    if (editingId === service.id) resetForm();
    if (!(await saveServices(next))) {
      setStatus("Не удалось сохранить. Откройте сайт через python server.py, чтобы база была доступна.");
      return;
    }
    setStatus("Услуга удалена. На сайте её больше нет.");
  };

  return (
    <>
      <a className="skip" href="#main">Перейти к содержанию</a>
      <Header kind="admin" />
      <main className="section admin" id="main">
        <div className="wrap">
          <header className="section__head">
            <h1>Услуги</h1>
            <p className="section__lead">
              Новая услуга сразу появляется в блоке «Чем могу помочь». Список хранится
              в базе data/crm.sqlite на этом компьютере.
            </p>
          </header>
          <div className="admin-layout">
            <form className="admin-form" onSubmit={onSubmit}>
              <h2>{editingId ? "Редактировать услугу" : "Новая услуга"}</h2>
              <label className="field">
                <span>Название</span>
                <input type="text" name="title" required maxLength={120} autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span>Описание</span>
                <textarea name="description" rows={4} required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <label className="field">
                <span>Результат</span>
                <textarea name="result" rows={2} required maxLength={240} value={result} onChange={(event) => setResult(event.target.value)} />
              </label>
              <label className="field">
                <span>Стоимость, тенге</span>
                <input type="text" name="price" inputMode="decimal" maxLength={40} autoComplete="off" value={price} disabled={!pricesReady} onChange={(event) => setPrice(event.target.value)} placeholder={pricesReady ? "Пусто, если цена ещё не назначена" : "Стоимость загрузится после входа на обновлённый сервер"} />
              </label>
              <div className="admin-form__actions">
                <button className="btn" type="submit">{editingId ? "Сохранить" : "Добавить услугу"}</button>
                <button className="btn btn--ghost" type="button" hidden={!editingId} onClick={() => { resetForm(); setStatus(""); }}>
                  Отмена
                </button>
              </div>
              <p className="request__status" role="status" hidden={!status}>{status}</p>
            </form>
            <section aria-labelledby="list-title">
              <div className="admin-list__head">
                <h2 id="list-title">Сейчас на сайте</h2>
                <div className="admin-form__actions">
                  <p>{ruCount(services.length, "услуга", "услуги", "услуг")}</p>
                  <button
                    className="btn btn--small btn--ghost"
                    type="button"
                    disabled={Boolean(pdfTask)}
                    onClick={() => exportPdf("catalog", async () => {
                      const { downloadServiceCatalog } = await import("../lib/pdf/serviceCatalogPdf.js");
                      await downloadServiceCatalog(services);
                    })}
                  >
                    {pdfTask === "catalog" ? "Формирование PDF…" : "Скачать каталог PDF"}
                  </button>
                </div>
              </div>
              <p className="request__status" role="status" hidden={!pdfStatus}>{pdfStatus}</p>
              <p className="services-empty" hidden={services.length > 0}>
                Услуг пока нет. Добавьте первую слева — она появится на сайте.
              </p>
              <ol className="admin-list">
                {services.map((service, index) => (
                  <li className={service.id === editingId ? "admin-card admin-card--editing" : "admin-card"} key={service.id}>
                    <p className="admin-card__num">{String(index + 1).padStart(2, "0")}</p>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <p className="admin-card__result">
                      <span>Результат</span>
                      {service.result}
                    </p>
                    <p className="admin-card__result">
                      <span>Стоимость</span>
                      {prices[service.id] ? `${prices[service.id]} тенге` : "Стоимость не указана"}
                    </p>
                    <div className="admin-card__actions">
                      <button
                        className="btn btn--ghost btn--tiny"
                        type="button"
                        disabled={Boolean(pdfTask)}
                        onClick={() => exportPdf(service.id, async () => {
                          const { downloadServicePdf } = await import("../lib/pdf/servicePdf.js");
                          await downloadServicePdf(service);
                        })}
                      >
                        {pdfTask === service.id ? "Формирование PDF…" : "Скачать PDF"}
                      </button>
                      <button className="btn btn--ghost btn--tiny" type="button" onClick={() => startEdit(service)}>Изменить</button>
                      <button className="btn btn--ghost btn--tiny" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Выше</button>
                      <button className="btn btn--ghost btn--tiny" type="button" disabled={index === services.length - 1} onClick={() => move(index, 1)}>Ниже</button>
                      <button className="btn btn--ghost btn--tiny" type="button" onClick={() => remove(service)}>Удалить</button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export function AdminPage() {
  return (
    <AdminGate kind="admin" title="Услуги — админка">
      <AdminWorkspace />
    </AdminGate>
  );
}
