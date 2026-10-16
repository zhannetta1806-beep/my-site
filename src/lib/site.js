export const PHONE_TEL = "+77770841313";
export const PHONE_LABEL = "+7 777 084-13-13";
export const EMAIL = "zhanna.sabirova.78@mail.ru";
export const WA_NUMBER = "77770841313";
export const WHATSAPP_URL = "https://wa.me/77770841313";

export function whatsappHref(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.host !== "wa.me" || parsed.pathname !== `/${WA_NUMBER}`) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function openWhatsapp(url) {
  const href = whatsappHref(url);
  if (!href) return false;
  const popup = window.open(href, "_blank", "noopener,noreferrer");
  return Boolean(popup);
}

export const OBJECT_TYPES = [
  "Медицинская организация",
  "Кафе и общественное питание",
  "Салон красоты или парикмахерская",
  "Детский сад или детский центр",
  "Баня или сауна",
  "Производство или склад",
  "Магазин",
  "Гостиница или общежитие",
  "Другое",
];
