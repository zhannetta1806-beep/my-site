import { createPortal } from "react-dom";
import { useI18n } from "../context/LanguageContext";
import { useSite } from "../context/SiteContext";
import { ruCount } from "../lib/plural";
import { presentService, serviceCount } from "../lib/siteCopy";
import { useModal } from "../lib/useModal";

export function CartDrawer() {
  const { cartOpen, closeCart, cartServices, removeService, clearCart, openOrder } = useSite();
  const { lang, t } = useI18n();
  const panelRef = useModal(cartOpen, closeCart);
  if (!cartOpen) return null;

  const count = cartServices.length;
  const shown = cartServices.map((service) => presentService(service, lang));
  const goServices = (event) => {
    event.preventDefault();
    closeCart();
    document.querySelector("#services")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return createPortal(
    <div className="cart" id="cart" ref={panelRef}>
      <div className="cart__backdrop" onClick={closeCart} />
      <div className="cart__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="cart__head">
          <div>
            <h2 id="cart-title">{t("cart")}</h2>
            <p className="cart__count">{count ? serviceCount(count, lang, ruCount) : t("cartEmpty")}</p>
          </div>
          <button className="btn btn--tiny btn--ghost" type="button" data-initial-focus onClick={closeCart}>
            {t("close")}
          </button>
        </div>
        <div className="cart__body">
          <p className="cart__empty" hidden={count > 0}>
            {t("cartEmptyHint")}
          </p>
          <ul className="cart__list" hidden={count === 0}>
            {shown.map((service) => (
              <li className="cart__item" key={service.id}>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <button className="btn btn--tiny btn--ghost" type="button" onClick={() => removeService(service.id)}>
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="cart__foot">
          <p className="cart__note" hidden={count === 0}>
            {t("priceNote")}
          </p>
          <button
            className="btn btn--wa"
            type="button"
            disabled={count === 0}
            onClick={() => {
              if (!cartServices.length) return;
              openOrder(cartServices);
            }}
          >
            {t("arrange")}
          </button>
          <a className="btn btn--ghost" href="#services" onClick={goServices}>
            {t("chooseServices")}
          </a>
          <button className="cart__clear" type="button" hidden={count === 0} onClick={clearCart}>
            {t("clearCart")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
