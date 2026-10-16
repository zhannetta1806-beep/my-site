import { EMAIL, PHONE_LABEL } from "../site.js";

export const NAVY = "#1a3344";
export const GREEN = "#2c5c4e";
export const INK = "#243038";
export const MUTED = "#5c675f";
export const LINE = "#ddd8d0";
export const SOFT = "#e5efe9";
export const CONTENT_WIDTH = 503;
export const PRICE_NOTE = "Стоимость услуг определяется индивидуально после уточнения объёма работ.";

export function pageHeader() {
  return {
    margin: [46, 22, 46, 0],
    stack: [
      {
        columns: [
          { text: "Жанна Сабирова", bold: true, fontSize: 9, color: NAVY },
          { text: "Эксперт СЭС", alignment: "right", fontSize: 9, color: GREEN },
        ],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 7, x2: CONTENT_WIDTH, y2: 7, lineWidth: 1.2, lineColor: GREEN }],
      },
    ],
  };
}

export function pageFooter(currentPage, pageCount) {
  return {
    margin: [46, 10, 46, 0],
    columns: [
      { text: "Санитарно-эпидемиологический аудит", fontSize: 8, color: MUTED },
      { text: `${currentPage} / ${pageCount}`, alignment: "right", fontSize: 8, color: MUTED },
    ],
  };
}

export function baseDocument(content, title) {
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [46, 64, 46, 52],
    defaultStyle: {
      font: "NotoSans",
      fontSize: 11,
      color: INK,
      lineHeight: 1.28,
    },
    info: {
      title,
      author: "Жанна Сабирова",
    },
    header: pageHeader,
    footer: pageFooter,
    content,
  };
}

export function documentIntro(title, subtitle, date) {
  return [
    { text: "Жанна Сабирова", fontSize: 11, bold: true, color: GREEN, margin: [0, 4, 0, 0] },
    { text: title, fontSize: 22, bold: true, color: NAVY, margin: [0, 6, 0, 4] },
    subtitle ? { text: subtitle, fontSize: 12, color: MUTED, margin: [0, 0, 0, 4] } : null,
    { text: `Дата формирования: ${date}`, fontSize: 10, color: MUTED, margin: [0, 2, 0, 14] },
  ].filter(Boolean);
}

export function contactLines() {
  return [
    ["Телефон", PHONE_LABEL],
    ["WhatsApp", PHONE_LABEL],
    ["Почта", EMAIL],
  ].filter(([, value]) => String(value || "").trim());
}

export function contactsSection(withPriceNote) {
  const lines = contactLines().map(([label, value]) => ({
    text: [{ text: `${label}:  `, bold: true, color: NAVY }, String(value)],
    margin: [0, 2, 0, 0],
  }));
  return {
    unbreakable: true,
    margin: [0, 12, 0, 0],
    stack: [
      { text: "Контакты", fontSize: 13, bold: true, color: NAVY, margin: [0, 0, 0, 4] },
      ...lines,
      withPriceNote ? { text: PRICE_NOTE, fontSize: 10, color: MUTED, margin: [0, 10, 0, 0] } : null,
    ].filter(Boolean),
  };
}
