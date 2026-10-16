import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WaIcon } from "./Icons";
import { useI18n } from "../context/LanguageContext";
import { useSite } from "../context/SiteContext";
import { leadFailureText, saveLead } from "../lib/leads";
import { useModal } from "../lib/useModal";
import { OBJECT_TYPES, WA_NUMBER, openWhatsapp, whatsappHref } from "../lib/site";
import { leadText, objectChoices, objectLabel, presentService } from "../lib/siteCopy";

const maxUrlLength = 1800;

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function validPhone(value) {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function OrderModal() {
  const { orderItems, closeOrder, dropServices } = useSite();
  const { lang, t, items: phrases } = useI18n();
  const open = Boolean(orderItems?.length);
  const panelRef = useModal(open, closeOrder);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const sendingRef = useRef(false);
  const attemptRef = useRef({ key: "", id: "" });
  const items = orderItems || [];

  useEffect(() => {
    if (open) return;
    setError("");
    setPhoneError("");
    setDone(false);
    setManualLink("");
  }, [open]);

  const attemptId = (chosen) => {
    const key = chosen.map((service) => service.id).join("\0");
    if (attemptRef.current.key !== key || !attemptRef.current.id) {
      attemptRef.current = {
        key,
        id: globalThis.crypto?.randomUUID?.() || `lead-${Date.now().toString(36)}`,
      };
    }
    return attemptRef.current.id;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (sendingRef.current || done) return;
    const form = event.currentTarget;
    const name = String(form.elements.name.value || "").trim();
    const phone = String(form.elements.phone.value || "").trim();
    const objectValue = String(form.elements.object.value || "").trim();
    const comment = String(form.elements.comment.value || "").trim().slice(0, 2000);
    if (!name) {
      setPhoneError("");
      setError(t("writeName"));
      form.elements.name.focus();
      return;
    }
    if (!validPhone(phone)) {
      setError("");
      setPhoneError(t("badPhone"));
      form.elements.phone.focus();
      requestAnimationFrame(() => {
        document.getElementById("order-phone-error")?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
    if (!OBJECT_TYPES.includes(objectValue)) {
      setPhoneError("");
      setError(t("chooseObject"));
      form.elements.object.focus();
      return;
    }
    setPhoneError("");
    const chosen = items.slice();
    if (!chosen.length) {
      setError(t("emptyOrder"));
      return;
    }
    sendingRef.current = true;
    setBusy(true);
    setError("");
    setManualLink("");
    const head = ["Заказ с сайта.", ...chosen.map((service) => `— ${service.title}`)].join("\n");
    const room = 2000 - head.length - 2;
    const message = comment
      ? (room > 0 ? `${head}\n\n${comment.slice(0, room)}` : comment.slice(0, 2000))
      : head.slice(0, 2000);
    try {
      const saved = await saveLead({
        id: attemptId(chosen),
        name,
        contact: phone,
        object: objectValue,
        message,
        services: chosen.map((service) => service.title),
      });
      if (!saved.ok || saved.where !== "db") {
        setError(lang === "kk" ? leadText(saved, { keepCart: true, lang }) : leadFailureText(saved, { keepCart: true }));
        return;
      }
      attemptRef.current = { key: "", id: "" };
      const lines = [
        phrases("waOrderHello"),
        "",
        `${phrases("waName")} ${name}`,
        `${phrases("waPhone")} ${phone}`,
        `${phrases("waObject")} ${objectLabel(objectValue, lang)}`,
        "",
        phrases("waOrder"),
        ...chosen.map((service) => `— ${presentService(service, lang).title}`),
      ];
      if (comment) lines.push("", comment);
      const text = lines.join("\n");
      const fullUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
      const href = whatsappHref(fullUrl.length <= maxUrlLength ? fullUrl : `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(phrases("waShort"))}`);
      dropServices(chosen.map((service) => service.id), t("orderSaved"));
      setDone(true);
      if (href && openWhatsapp(href)) {
        form.reset();
        closeOrder();
        return;
      }
      setManualLink(href);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div className="request-modal" id="order-modal" hidden={!open} ref={panelRef}>
      <div className="request-modal__backdrop" onClick={closeOrder} />
      <div className="request-modal__panel" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <div className="request-modal__head">
          <div>
            <h2 id="order-title">{t("orderTitle")}</h2>
            <p>{t("orderLead")}</p>
          </div>
          <button className="btn btn--tiny btn--ghost" type="button" onClick={closeOrder}>
            {t("close")}
          </button>
        </div>
        <form className="request" noValidate onSubmit={onSubmit}>
          <div className="order-box">
            <p className="order-box__label">{t("orderLabel")}</p>
            <ul className="order-box__list">
              {items.map((service) => (
                <li className="order-box__item" key={service.id}>
                  <span>{presentService(service, lang).title}</span>
                </li>
              ))}
            </ul>
            <p className="order-box__note">{t("priceNote")}</p>
          </div>
          <label className="field">
            <span>{t("name")}</span>
            <input type="text" name="name" autoComplete="name" required maxLength={120} data-initial-focus />
          </label>
          <label className="field">
            <span>{t("phoneNumber")}</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              inputMode="tel"
              required
              maxLength={20}
              placeholder="+7 777 000-00-00"
              aria-invalid={phoneError ? "true" : "false"}
              aria-describedby={phoneError ? "order-phone-error" : undefined}
            />
            <p className="field__error" id="order-phone-error" role="alert" hidden={!phoneError}>{phoneError}</p>
          </label>
          <label className="field">
            <span>{t("objectType")}</span>
            <select name="object" required defaultValue="">
              <option value="">{t("chooseObject")}</option>
              {objectChoices(lang).map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("orderComment")}</span>
            <textarea name="comment" rows={4} maxLength={2000} placeholder={t("orderCommentPlaceholder")} />
          </label>
          <p className="request__status" role="alert" hidden={!error}>{error}</p>
          <p className="request__status" role="status" hidden={!manualLink}>
            {t("whatsappStay")}{" "}
            <a href={manualLink || undefined} target="_blank" rel="noopener noreferrer">{t("toWhatsapp")}</a>
          </p>
          <button type="submit" className="btn btn--wa" disabled={busy || done} hidden={Boolean(manualLink)} aria-busy={busy}>
            <WaIcon />
            {t("toWhatsapp")}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
