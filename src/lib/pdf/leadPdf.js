import { GREEN, INK, LINE, MUTED, NAVY, baseDocument, contactsSection, documentIntro } from "./documentTheme.js";
import { cleanText, excerpt, formatDateTime, formatLongDate, leadFileName, pdfError, statusLabel } from "./documentUtils.js";

function fieldRows(lead) {
  const created = formatDateTime(lead.createdAt) || cleanText(lead.createdAt);
  return [
    ["Идентификатор", cleanText(lead.id)],
    ["Дата и время", created],
    ["Имя", cleanText(lead.name)],
    ["Контакт", cleanText(lead.contact)],
    ["Объект", cleanText(lead.object)],
    ["Статус", statusLabel(lead.status)],
  ].filter(([, value]) => value);
}

export function buildLeadPdf(lead, generatedAt = new Date()) {
  const source = lead && typeof lead === "object" ? lead : {};
  const services = Array.isArray(source.services) ? source.services.map(cleanText).filter(Boolean) : [];
  const message = cleanText(source.message);
  const rows = fieldRows(source);
  const content = [
    ...documentIntro(
      "Заявка на услуги",
      "Санитарно-эпидемиологический аудит и консультационные услуги",
      formatLongDate(generatedAt)
    ),
  ];
  if (rows.length) {
    content.push({
      table: {
        widths: [130, "*"],
        body: rows.map(([label, value]) => [
          { text: label, bold: true, color: NAVY, fontSize: 10, margin: [4, 4, 4, 4] },
          { text: value, fontSize: 11, margin: [4, 4, 4, 4] },
        ]),
      },
      layout: {
        hLineColor: () => LINE,
        vLineColor: () => LINE,
        hLineWidth: () => 0.4,
        vLineWidth: () => 0.4,
      },
      margin: [0, 0, 0, 12],
    });
  }
  if (services.length) {
    content.push(
      { text: "Услуги", bold: true, color: NAVY, fontSize: 13, margin: [0, 2, 0, 4] },
      { ul: services, color: INK, markerColor: GREEN, margin: [0, 0, 0, 10] }
    );
  }
  if (message) {
    content.push(
      { text: "Обращение", bold: true, color: NAVY, fontSize: 13, margin: [0, 2, 0, 4] },
      { text: message, margin: [0, 0, 0, 8] }
    );
  }
  content.push(contactsSection(true));
  return baseDocument(content, "Заявка на услуги");
}

export async function downloadLeadPdf(lead) {
  if (!lead || typeof lead !== "object") throw pdfError("empty");
  const generatedAt = new Date();
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildLeadPdf(lead, generatedAt), leadFileName(generatedAt, lead.id));
}

export function leadCard(lead) {
  const source = lead && typeof lead === "object" ? lead : {};
  const services = Array.isArray(source.services) ? source.services.map(cleanText).filter(Boolean) : [];
  const message = cleanText(source.message).replace(/\s+/g, " ");
  const shortMessage = excerpt(message, 280);
  const headline = [formatDateTime(source.createdAt), cleanText(source.name), statusLabel(source.status)].filter(Boolean).join("   ·   ");
  const meta = [cleanText(source.contact), cleanText(source.object)].filter(Boolean).join("   ·   ");
  const stack = [];
  if (headline) stack.push({ text: headline, bold: true, color: NAVY, fontSize: 11 });
  if (meta) stack.push({ text: meta, color: MUTED, fontSize: 9, margin: [0, 2, 0, 0] });
  if (services.length) stack.push({ text: services.join(", "), fontSize: 9, margin: [0, 3, 0, 0] });
  if (shortMessage) stack.push({ text: shortMessage, fontSize: 9, color: INK, margin: [0, 3, 0, 0] });
  if (!stack.length) return null;
  stack.push({
    margin: [0, 6, 0, 0],
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 503, y2: 0, lineWidth: 0.4, lineColor: LINE }],
  });
  return { stack, unbreakable: true, margin: [0, 0, 0, 8] };
}
