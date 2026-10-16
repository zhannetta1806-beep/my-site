import { Link } from "react-router-dom";
import { useI18n } from "../context/LanguageContext";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <p>{t("footer")}</p>
        <p className="site-footer__links">
          <a href="#services">{t("navServices")}</a>
          <a href="#objects">{t("navObjects")}</a>
          <a href="#checklist">{t("navChecklist")}</a>
          <a href="#faq">{t("navFaq")}</a>
          <Link to="/admin">{t("footerAdmin")}</Link>
          <Link to="/crm">{t("footerLeads")}</Link>
          <a href="#top">{t("footerTop")}</a>
        </p>
      </div>
    </footer>
  );
}
