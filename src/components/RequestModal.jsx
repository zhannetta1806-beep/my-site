import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WaIcon } from "./Icons";
import { useI18n } from "../context/LanguageContext";
import { useSite } from "../context/SiteContext";
import { leadFailureText, saveLead } from "../lib/leads";
import { useModal } from "../lib/useModal";
import { OBJECT_TYPES, PHONE_LABEL, WA_NUMBER, openWhatsapp } from "../lib/site";
import { leadText, objectChoices, objectLabel, presentService } from "../lib/siteCopy";

const maxUrlLength = 1800;

export function RequestModal() {
  const { requestOpen, closeRequest, cartServices, removeService } = useSite();
  const { lang, t, items } = useI18n();
  const shownServices = cartServices.map((service) => presentService(service, lang));
  const panelRef = useModal(requestOpen, closeRequest);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [requestText, setRequestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const sendingRef = useRef(false);
  const leadIdRef = useRef("");

  const whatsappUrl = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (sendingRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name) => String(data.get(name) || "").trim();
    if (!field("name") || !field("contact") || !field("message")) {
      setError(t("fillRequired"));
      return;
    }
    const chosen = cartServices;
    const lines = [chosen.length ? items("waHelloOrder") : items("waHelloRequest")];
    if (chosen.length) {
      lines.push("", items("waServices"));
      for (const service of chosen) lines.push(`— ${presentService(service, lang).title}`);
    }
    lines.push("", `${items("waName")} ${field("name")}`, `${items("waContact")} ${field("contact")}`, `${items("waObject")} ${objectLabel(field("object"), lang)}`, "", field("message"));
    const text = lines.join("\n");
    if (!leadIdRef.current) {
      leadIdRef.current = globalThis.crypto?.randomUUID?.() || `lead-${Date.now().toString(36)}`;
    }
    sendingRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    setManualLink("");
    try {
      const saved = await saveLead({
        id: leadIdRef.current,
        name: field("name"),
        contact: field("contact"),
        object: field("object"),
        message: field("message"),
        services: chosen.map((service) => service.title),
      });
      if (!saved.ok || saved.where !== "db") {
        setError(lang === "kk" ? leadText(saved, { lang }) : leadFailureText(saved));
        return;
      }
      leadIdRef.current = "";
      setRequestText(text);
      form.reset();
      const fullUrl = whatsappUrl(text);
      if (fullUrl.length <= maxUrlLength) {
        setStatus(items("saved")(PHONE_LABEL));
        if (!openWhatsapp(fullUrl)) setManualLink(fullUrl);
        return;
      }
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
      setStatus(
        copied
          ? items("savedLongCopied")(PHONE_LABEL)
          : items("savedLong")(PHONE_LABEL)
      );
      const shortUrl = whatsappUrl(items("waShort"));
      if (!openWhatsapp(shortUrl)) setManualLink(shortUrl);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const copyRequest = async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(requestText);
      copied = true;
    } catch {
      copied = false;
    }
    setStatus(
      copied
        ? items("copied")(PHONE_LABEL)
        : items("copyFailed")(PHONE_LABEL)
    );
  };

  return createPortal(
    <div className="request-modal" id="request-modal" hidden={!requestOpen} ref={panelRef}>
      <div className="request-modal__backdrop" onClick={closeRequest} />
      <div className="request-modal__panel" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <div className="request-modal__head">
          <div>
            <h2 id="request-title">{t("requestTitle")}</h2>
            <p>{t("requestLead")}</p>
          </div>
          <button className="btn btn--tiny btn--ghost" type="button" onClick={closeRequest}>
            {t("close")}
          </button>
        </div>
        <form className="request" onSubmit={onSubmit}>
          <div className="order-box" hidden={cartServices.length === 0}>
            <p className="order-box__label">{t("inOrder")}</p>
            <ul className="order-box__list">
              {shownServices.map((service) => (
                <li className="order-box__item" key={service.id}>
                  <span>{service.title}</span>
                  <button className="btn btn--tiny btn--ghost" type="button" onClick={() => removeService(service.id)}>
                    {t("remove")}
                  </button>
                </li>
              ))}
            </ul>
            <p className="order-box__note">{t("priceNote")}</p>
          </div>
          <label className="field">
            <span>{t("name")}</span>
            <input type="text" name="name" autoComplete="name" required data-initial-focus />
          </label>
          <label className="field">
            <span>{t("contactField")}</span>
            <input type="text" name="contact" autoComplete="tel" required />
          </label>
          <label className="field">
            <span>{t("objectType")}</span>
            <select name="object" defaultValue={OBJECT_TYPES[0]}>
              {objectChoices(lang).map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("whatHappened")}</span>
            <textarea name="message" rows={4} required placeholder={t("messagePlaceholder")} />
          </label>
          <button type="submit" className="btn btn--wa" disabled={busy} aria-busy={busy}>
            <WaIcon />
            <span>{t("sendRequest")}</span>
          </button>
          <p className="request__status" role="alert" hidden={!error}>{error}</p>
          <p className="request__status" role="status" hidden={!status}>{status}</p>
          <p className="request__status" role="status" hidden={!manualLink}>
            {t("whatsappStay")}{" "}
            <a href={manualLink || undefined} target="_blank" rel="noopener noreferrer">{t("toWhatsapp")}</a>
          </p>
          <button type="button" className="btn btn--ghost request__copy" hidden={!requestText} onClick={copyRequest}>
            {t("copyRequest")}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
