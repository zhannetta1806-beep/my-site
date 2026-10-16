import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { flushLocalLeads } from "../lib/leads";
import { defaultServices, loadServices, peekServices, saveServices as persistServices } from "../lib/services";
import { getLang, presentService, text } from "../lib/siteCopy";

const CART_KEY = "sanexpert-cart";
const SiteContext = createContext(null);

function readCart() {
  try {
    const data = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(data) ? data.map((id) => String(id)) : [];
  } catch {
    return [];
  }
}

function writeCart(ids) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(ids));
  } catch {
    /* корзина останется только до обновления страницы */
  }
}

function keepKnown(ids, services) {
  const known = new Set(services.map((service) => service.id));
  return ids.filter((id, index, all) => known.has(id) && all.indexOf(id) === index);
}

export function SiteProvider({ children }) {
  const [services, setServices] = useState(() => peekServices() || defaultServices());
  const [cartIds, setCartIds] = useState(() => keepKnown(readCart(), peekServices() || defaultServices()));
  const [cartOpen, setCartOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [orderItems, setOrderItems] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [live, setLive] = useState("");
  const assistantRef = useRef(null);
  const cartIdsRef = useRef(cartIds);
  const servicesRef = useRef(services);
  const revision = useRef(0);
  cartIdsRef.current = cartIds;
  servicesRef.current = services;

  const applyServices = useCallback((next) => {
    servicesRef.current = next;
    setServices(next);
    setCartIds((current) => {
      const pruned = keepKnown(current, next);
      if (pruned.join("\0") !== current.join("\0")) writeCart(pruned);
      return pruned;
    });
  }, []);

  useEffect(() => {
    let ignore = false;
    const pull = async () => {
      const ticket = revision.current;
      const next = await loadServices();
      if (ignore || ticket !== revision.current) return;
      applyServices(next);
    };
    pull();
    flushLocalLeads();
    const onStorage = (event) => {
      if (event.key === CART_KEY) setCartIds(keepKnown(readCart(), servicesRef.current));
    };
    const onShow = () => {
      if (!ignore) pull();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      ignore = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, [applyServices]);

  const closeAssistant = useCallback(() => {
    assistantRef.current?.close();
  }, []);

  const registerAssistant = useCallback((api) => {
    assistantRef.current = api;
  }, []);

  const rememberCart = useCallback((ids, message) => {
    const unique = [...new Set(ids)];
    cartIdsRef.current = unique;
    writeCart(unique);
    setCartIds(unique);
    if (message) setLive(message);
  }, []);

  const addService = useCallback((id) => {
    const current = cartIdsRef.current;
    if (current.includes(id)) return;
    const service = servicesRef.current.find((item) => item.id === id);
    const lang = getLang();
    rememberCart(
      [...current, id],
      service ? text(lang, "added")(presentService(service, lang).title) : text(lang, "addedGeneric")
    );
  }, [rememberCart]);

  const removeService = useCallback((id) => {
    const current = cartIdsRef.current;
    if (!current.includes(id)) return;
    const service = servicesRef.current.find((item) => item.id === id);
    const lang = getLang();
    rememberCart(
      current.filter((item) => item !== id),
      service ? text(lang, "removed")(presentService(service, lang).title) : text(lang, "removedGeneric")
    );
  }, [rememberCart]);

  const clearCart = useCallback(() => {
    rememberCart([], text(getLang(), "cartCleared"));
  }, [rememberCart]);

  const dropServices = useCallback((ids, message) => {
    const gone = new Set(ids);
    rememberCart(
      cartIdsRef.current.filter((id) => !gone.has(id)),
      message
    );
  }, [rememberCart]);

  const saveServices = useCallback(async (next) => {
    revision.current += 1;
    try {
      const saved = await persistServices(next);
      revision.current += 1;
      applyServices(saved);
      return true;
    } catch {
      return false;
    }
  }, [applyServices]);

  const openCart = useCallback(() => {
    closeAssistant();
    setNavOpen(false);
    setRequestOpen(false);
    setOrderItems(null);
    setCartOpen(true);
  }, [closeAssistant]);

  const closeCart = useCallback(() => setCartOpen(false), []);

  const closeRequest = useCallback(() => {
    setRequestOpen(false);
    if (window.location.hash === "#contact") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const openRequest = useCallback(() => {
    closeAssistant();
    setCartOpen(false);
    setOrderItems(null);
    setNavOpen(false);
    setRequestOpen(true);
    if (window.location.hash !== "#contact") history.pushState(null, "", "#contact");
  }, [closeAssistant]);

  const closeOrder = useCallback(() => setOrderItems(null), []);

  const openOrder = useCallback((items) => {
    if (!items?.length) return;
    closeAssistant();
    setCartOpen(false);
    setRequestOpen(false);
    setNavOpen(false);
    if (window.location.hash === "#contact") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setOrderItems(items.map((item) => ({ ...item })));
  }, [closeAssistant]);

  const startOrder = useCallback(() => {
    const items = cartIdsRef.current
      .map((id) => servicesRef.current.find((service) => service.id === id))
      .filter(Boolean);
    if (!items.length) {
      setNavOpen(false);
      setLive(text(getLang(), "pickFirst"));
      document.querySelector("#services")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    openOrder(items);
  }, [openOrder]);

  useEffect(() => {
    const root = document.getElementById("root");
    const request = requestOpen || Boolean(orderItems?.length);
    document.documentElement.classList.toggle("request-open", request);
    document.documentElement.classList.toggle("cart-open", cartOpen);
    if (root) root.inert = request || cartOpen;
  }, [requestOpen, orderItems, cartOpen]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.pathname !== "/") return;
      if (window.location.hash === "#contact") openRequest();
      else setRequestOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [openRequest]);

  const cartServices = useMemo(() => {
    const byId = new Map(services.map((service) => [service.id, service]));
    return cartIds.map((id) => byId.get(id)).filter(Boolean);
  }, [services, cartIds]);

  const value = useMemo(
    () => ({
      services,
      saveServices,
      cartIds,
      cartServices,
      addService,
      removeService,
      clearCart,
      dropServices,
      hasService: (id) => cartIds.includes(id),
      cartOpen,
      openCart,
      closeCart,
      requestOpen,
      openRequest,
      closeRequest,
      orderItems,
      openOrder,
      startOrder,
      closeOrder,
      navOpen,
      setNavOpen,
      registerAssistant,
    }),
    [
      services,
      saveServices,
      cartIds,
      cartServices,
      addService,
      removeService,
      clearCart,
      dropServices,
      cartOpen,
      openCart,
      closeCart,
      requestOpen,
      openRequest,
      closeRequest,
      orderItems,
      openOrder,
      startOrder,
      closeOrder,
      navOpen,
      registerAssistant,
    ]
  );

  return (
    <SiteContext.Provider value={value}>
      {children}
      {createPortal(
        <p className="visually-hidden" aria-live="polite">{live}</p>,
        document.body
      )}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("Контекст сайта недоступен");
  return value;
}
