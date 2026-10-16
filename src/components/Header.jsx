import { Link } from "react-router-dom";
import { useI18n } from "../context/LanguageContext";
import { useSite } from "../context/SiteContext";
import { useAdminLogout } from "../lib/adminLogout";
import { ruCount } from "../lib/plural";
import { PHONE_LABEL, PHONE_TEL } from "../lib/site";
import { serviceCount } from "../lib/siteCopy";

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("langLabel")}>
      <button type="button" aria-pressed={lang === "ru"} onClick={() => setLang("ru")}>RU</button>
      <button type="button" aria-pressed={lang === "kk"} onClick={() => setLang("kk")}>KZ</button>
    </div>
  );
}

export function Header({ kind = "home" }) {
  const { cartServices, cartOpen, openCart, closeCart, navOpen, setNavOpen, openRequest, startOrder } = useSite();
  const { lang, t } = useI18n();
  const logout = useAdminLogout();
  const count = cartServices.length;
  const countLabel = serviceCount(count, lang, ruCount);

  const closeMenu = () => setNavOpen(false);

  if (kind === "admin" || kind === "crm") {
    return (
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="Жанна, эксперт СЭС — на сайт">
            <span className="brand__mark" aria-hidden="true">Ж</span>
            <span className="brand__name">
              Жанна
              <small>{kind === "admin" ? "админка" : "заявки"}</small>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Админка">
            <ul>
              {kind === "admin" ? (
                <>
                  <li><Link to="/crm">Заявки</Link></li>
                  <li><Link to="/admin/requisites">Реквизиты</Link></li>
                  <li><Link to="/#services">Услуги на сайте</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/admin">Услуги</Link></li>
                  <li><Link to="/admin/requisites">Реквизиты</Link></li>
                  <li><Link to="/">Сайт</Link></li>
                </>
              )}
            </ul>
          </nav>
          {logout ? (
            <button className="btn btn--small btn--ghost" type="button" onClick={logout}>Выйти</button>
          ) : null}
          <Link className="btn btn--small" to={kind === "admin" ? "/#services" : "/"}>
            Открыть сайт
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className={`site-header${navOpen ? " is-open" : ""}`}>
      <div className="site-header__inner">
        <a className="brand" href="#top" aria-label={t("brandHome")} onClick={closeMenu}>
          <span className="brand__mark" aria-hidden="true">ЖС</span>
          <span className="brand__name">
            Жанна Сабирова
            <small>{t("brandRole")}</small>
          </span>
        </a>

        <button
          className="nav-toggle"
          type="button"
          aria-expanded={navOpen}
          aria-controls="site-nav"
          onClick={() => setNavOpen(!navOpen)}
        >
          <span className="visually-hidden">{t("menu")}</span>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav
          className="site-nav"
          id="site-nav"
          aria-label={t("navLabel")}
          onClick={(event) => {
            const link = event.target.closest("a");
            if (!link) return;
            closeMenu();
            if (link.getAttribute("href") === "#contact") {
              event.preventDefault();
              openRequest();
            }
          }}
        >
          <ul>
            <li><a href="#services">{t("navServices")}</a></li>
            <li><a href="#objects">{t("navObjects")}</a></li>
            <li><a href="#process">{t("navProcess")}</a></li>
            <li><a href="#about">{t("navAbout")}</a></li>
            <li><a href="#checklist">{t("headerChecklist")}</a></li>
            <li><a href="#faq">{t("navFaq")}</a></li>
            <li><a href="#contact">{t("navRequest")}</a></li>
          </ul>
          <a className="header-phone header-phone--menu" href={`tel:${PHONE_TEL}`}>{PHONE_LABEL}</a>
        </nav>

        <LanguageSwitch />
        <a className="header-phone" href={`tel:${PHONE_TEL}`}>{PHONE_LABEL}</a>
        <button
          className={`cart-toggle${count ? " cart-toggle--filled" : ""}`}
          type="button"
          aria-expanded={cartOpen}
          aria-controls="cart"
          aria-label={count ? t("cartFilled")(countLabel) : t("cart")}
          onClick={() => (cartOpen ? closeCart() : openCart())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 7h11l-1 13h-9l-1-13z" />
            <path d="M9 7V5.8A3 3 0 0 1 12 2.8a3 3 0 0 1 3 3V7" />
          </svg>
          <span className="visually-hidden">{t("cart")}</span>
          <span className="cart-toggle__count" hidden={!count}>{count}</span>
        </button>
        <a
          className="btn btn--small"
          href="#services"
          onClick={(event) => {
            event.preventDefault();
            closeMenu();
            startOrder();
          }}
        >
          {t("headerOrder")}
        </a>
      </div>
    </header>
  );
}
