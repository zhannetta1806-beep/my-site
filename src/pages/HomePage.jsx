import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Assistant } from "../components/Assistant";
import { CartDrawer } from "../components/CartDrawer";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Icon, WaIcon } from "../components/Icons";
import { OrderModal } from "../components/OrderModal";
import { RequestModal } from "../components/RequestModal";
import { useI18n } from "../context/LanguageContext";
import { useSite } from "../context/SiteContext";
import { usePageMeta } from "../lib/usePageMeta";
import { EMAIL, PHONE_LABEL, PHONE_TEL, WHATSAPP_URL } from "../lib/site";
import { checklistVerdict, list, presentService } from "../lib/siteCopy";

const serviceIcons = {
  audit: '<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  inspection: '<path d="M12 3 5 6v5c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  control: '<path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M8.5 13h7M8.5 16.5h5"/>',
  outbreak: '<path d="M8 3.5h5.2L17 7.2V20H8z"/><path d="M13.2 3.5V7.2H17M10.2 11.2h4.2M10.2 14.4h4.2M10.2 17.4h2.4"/>',
  consult: '<path d="M6 16.5 4 20l4.2-1.2A8.5 8.5 0 1 0 6 16.5z"/><path d="M9 11h6M9 14h4"/>',
  opening: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/>',
};

const checklistKey = "sanexpert-checklist";

function ServiceIcon({ id }) {
  const body = serviceIcons[id] || serviceIcons.consult;
  return (
    <div
      className="service__icon"
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
      }}
    />
  );
}

function Checklist() {
  const { openRequest } = useSite();
  const { lang, t, items } = useI18n();
  const checks = items("checks");
  const [checked, setChecked] = useState(() => {
    const total = list("ru", "checks").length;
    try {
      const saved = JSON.parse(localStorage.getItem(checklistKey)) || [];
      return Array.from({ length: total }, (_, index) => Boolean(saved[index]));
    } catch {
      return Array.from({ length: total }, () => false);
    }
  });
  const done = checked.filter(Boolean).length;

  const toggle = (index) => {
    const next = checked.map((value, item) => (item === index ? !value : value));
    setChecked(next);
    try {
      localStorage.setItem(checklistKey, JSON.stringify(next));
    } catch {
      /* отметки останутся до обновления страницы */
    }
  };

  return (
    <form className="check" aria-label={t("checkForm")} style={{ "--progress": done / checks.length }} onSubmit={(event) => event.preventDefault()}>
      <fieldset className="check__list">
        <legend className="visually-hidden">{t("checkLegend")}</legend>
        {checks.map((label, index) => (
          <label key={index}>
            <input type="checkbox" checked={checked[index]} onChange={() => toggle(index)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="check__score">
        <p className="check__count">
          <span>{done}</span>
          <span className="check__total">/{checks.length}</span>
        </p>
        <div className="meter" aria-hidden="true"><span></span></div>
        <p className="check__verdict" aria-live="polite">{checklistVerdict(done, checks.length, lang)}</p>
        <a className="link-arrow" href="#contact" onClick={(event) => { event.preventDefault(); openRequest(); }}>
          {t("checkGaps")}
        </a>
      </div>
    </form>
  );
}

export function HomePage() {
  const { services, cartIds, addService, removeService, openOrder, openRequest, startOrder } = useSite();
  const { lang, t, items } = useI18n();
  const location = useLocation();
  usePageMeta(t("metaTitle"));

  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      name: t("metaTitle"),
      description: items("schemaDescription"),
      telephone: PHONE_TEL,
      email: EMAIL,
      founder: { "@type": "Person", name: "Жанна Сабирова", jobTitle: items("schemaJob") },
      knowsAbout: items("schemaTopics"),
    });
    document.head.append(script);
    return () => script.remove();
  }, [lang, t, items]);

  useEffect(() => {
    if (location.hash === "#contact") {
      openRequest();
      return;
    }
    if (!location.hash) return;
    document.querySelector(location.hash)?.scrollIntoView();
  }, [location.hash, openRequest]);

  const ask = (event) => {
    event.preventDefault();
    openRequest();
  };

  const orderServices = (event) => {
    event.preventDefault();
    startOrder();
  };

  return (
    <>
      <a className="skip" href="#main">{t("skip")}</a>
      <Header />
      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="wrap hero__grid">
            <div className="hero__text">
              <p className="hero__name">Жанна Сабирова</p>
              <p className="kicker">{t("heroKicker")}</p>
              <h1 id="hero-title">{t("heroTitle")}</h1>
              <p className="hero__lead">{t("heroLead")}</p>
              <div className="hero__actions">
                <a className="btn" href="#contact" onClick={ask}>{t("consult")}</a>
                <a className="btn btn--ghost" href="#services" onClick={orderServices}>{t("orderService")}</a>
                <a className="btn btn--ghost" href="#services">{t("viewServices")}</a>
              </div>
            </div>
            <figure className="hero__portrait">
              <img src="/images/zhanna.png" width="560" height="700" alt={t("portraitAlt")} />
              <figcaption>Жанна Сабирова</figcaption>
            </figure>
          </div>
        </section>

        <section className="section section--white" id="services" aria-labelledby="services-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("servicesKicker")}</p>
              <h2 id="services-title">{t("servicesTitle")}</h2>
              <p className="section__lead">{t("servicesLead")}</p>
            </header>
            <ol className="services">
              {services.map((service) => {
                const shown = presentService(service, lang);
                const inCart = cartIds.includes(service.id);
                return (
                  <li className={inCart ? "service service--in-cart" : "service"} key={service.id}>
                    <ServiceIcon id={service.id} />
                    <h3>{shown.title}</h3>
                    <p>{shown.description}</p>
                    <p className="service__result">
                      <span>{t("result")}</span>
                      {shown.result}
                    </p>
                    <div className="service__actions">
                      <button className="btn btn--small service__order" type="button" onClick={() => openOrder([service])}>
                        {t("arrange")}
                      </button>
                      <button
                        className={inCart ? "btn btn--small btn--ghost service__add is-in-cart" : "btn btn--small btn--ghost service__add"}
                        type="button"
                        aria-pressed={inCart}
                        aria-label={inCart ? t("removeCartLabel")(shown.title) : t("addCartLabel")(shown.title)}
                        onClick={() => (inCart ? removeService(service.id) : addService(service.id))}
                      >
                        {inCart ? t("removeCart") : t("addCart")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="services-empty" hidden={services.length > 0}>
              {t("emptyServices")} <Link to="/admin">{t("adminLink")}</Link>.
            </p>
          </div>
        </section>

        <section className="section" id="objects" aria-labelledby="objects-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("objectsKicker")}</p>
              <h2 id="objects-title">{t("objectsTitle")}</h2>
              <p className="section__lead">{t("objectsLead")}</p>
            </header>
            <ul className="object-grid">
              <li className="object-card">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><path d="M12 21s7-4.4 7-10a7 7 0 1 0-14 0c0 5.6 7 10 7 10z" /><path d="M12 8v6M9 11h6" /></Icon>
                </span>
                <h3>{items("objects")[0][0]}</h3>
                <p>{items("objects")[0][1]}</p>
              </li>
              <li className="object-card">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><path d="M8 3h8l1 7H7L8 3z" /><path d="M7 10c0 4 2.2 7 5 7s5-3 5-7" /><path d="M12 17v3" /></Icon>
                </span>
                <h3>{items("objects")[1][0]}</h3>
                <p>{items("objects")[1][1]}</p>
              </li>
              <li className="object-card">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><path d="M8.2 7.2 18 17.8M8.2 16.8 18 6.2" /></Icon>
                </span>
                <h3>{items("objects")[2][0]}</h3>
                <p>{items("objects")[2][1]}</p>
              </li>
              <li className="object-card">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><circle cx="12" cy="7" r="2.4" /><path d="M8 20v-3.2a4 4 0 0 1 8 0V20" /><path d="M5 13h2.2M16.8 13H19" /></Icon>
                </span>
                <h3>{items("objects")[3][0]}</h3>
                <p>{items("objects")[3][1]}</p>
              </li>
              <li className="object-card">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><path d="M12 3s5 5.2 5 9a5 5 0 0 1-10 0c0-3.8 5-9 5-9z" /></Icon>
                </span>
                <h3>{items("objects")[4][0]}</h3>
                <p>{items("objects")[4][1]}</p>
              </li>
              <li className="object-card object-card--wide">
                <span className="object-card__icon" aria-hidden="true">
                  <Icon><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" /></Icon>
                </span>
                <h3>{items("objects")[5][0]}</h3>
                <p>{items("objects")[5][1]}</p>
              </li>
            </ul>
          </div>
        </section>

        <section className="section section--white" id="process" aria-labelledby="process-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("processKicker")}</p>
              <h2 id="process-title">{t("processTitle")}</h2>
              <p className="section__lead">{t("processLead")}</p>
            </header>
            <ol className="steps">
              <li className="step">
                <span className="step__index">01</span>
                <div className="step__body">
                  <h3>{items("steps")[0][0]}</h3>
                  <p>{items("steps")[0][1]}</p>
                </div>
              </li>
              <li className="step">
                <span className="step__index">02</span>
                <div className="step__body">
                  <h3>{items("steps")[1][0]}</h3>
                  <p>{items("steps")[1][1]}</p>
                </div>
              </li>
              <li className="step">
                <span className="step__index">03</span>
                <div className="step__body">
                  <h3>{items("steps")[2][0]}</h3>
                  <p>{items("steps")[2][1]}</p>
                </div>
              </li>
              <li className="step">
                <span className="step__index">04</span>
                <div className="step__body">
                  <h3>{items("steps")[3][0]}</h3>
                  <p>{items("steps")[3][1]}</p>
                </div>
              </li>
            </ol>
            <p className="process__more">
              <a className="link-arrow" href="#checklist">{t("processMore")}</a>
            </p>
          </div>
        </section>

        <section className="section" id="about" aria-labelledby="about-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("aboutKicker")}</p>
              <h2 id="about-title">Жанна Сабирова</h2>
            </header>
            <div className="about">
              <blockquote className="about__quote">
                <p>{t("aboutQuote")}</p>
                <footer>
                  <span className="about__sign">Жанна Сабирова</span>
                  {t("aboutRole")}
                </footer>
              </blockquote>
              <div className="about__text">
                <p>{t("aboutYears")}</p>
                <p>{t("aboutTask")}</p>
                <ul className="principles">
                  {items("principles").map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--warm" id="checklist" aria-labelledby="checklist-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("checkKicker")}</p>
              <h2 id="checklist-title">{t("checkTitle")}</h2>
              <p className="section__lead">{t("checkLead")}</p>
            </header>
            <Checklist />
          </div>
        </section>

        <section className="section section--white" id="faq" aria-labelledby="faq-title">
          <div className="wrap">
            <header className="section__head">
              <p className="kicker">{t("faqKicker")}</p>
              <h2 id="faq-title">{t("faqTitle")}</h2>
            </header>
            <div className="faq">
              {items("faq").map(([question, answer]) => (
                <details name="faq" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section contact" id="contact" aria-labelledby="contact-title">
          <div className="wrap contact__grid">
            <div className="contact__intro">
              <p className="kicker">{t("contactKicker")}</p>
              <h2 id="contact-title">{t("contactTitle")}</h2>
              <p className="section__lead">{t("contactLead")}</p>
              <dl className="contact__info">
                <div>
                  <dt>{t("phone")}</dt>
                  <dd><a href={`tel:${PHONE_TEL}`}>{PHONE_LABEL}</a></dd>
                </div>
                <div>
                  <dt>{t("email")}</dt>
                  <dd><a href={`mailto:${EMAIL}`}>{EMAIL}</a></dd>
                </div>
                <div>
                  <dt>{t("format")}</dt>
                  <dd>{t("formatValue")}</dd>
                </div>
                <div>
                  <dt>{t("experience")}</dt>
                  <dd>{t("experienceValue")}</dd>
                </div>
              </dl>
              <a className="btn btn--wa" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <WaIcon />
                {t("whatsapp")}
              </a>
            </div>
            <div className="contact__invite">
              <p>{t("contactInvite")}</p>
              <button className="btn" type="button" onClick={openRequest}>{t("leaveRequest")}</button>
            </div>
          </div>
        </section>
      </main>
      <Assistant />
      <a className="wa-float" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
        <WaIcon size={20} />
        WhatsApp
      </a>
      <Footer />
      <CartDrawer />
      <RequestModal />
      <OrderModal />
    </>
  );
}
