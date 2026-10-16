import { GREEN, INK, LINE, MUTED, NAVY, SOFT, baseDocument } from "./documentTheme.js";
import { cleanText, formatLongDate, invoiceFileName, pdfError } from "./documentUtils.js";
import { formatTenge, prepareInvoice } from "./invoiceMath.js";

const tableLayout = {
  hLineColor: () => LINE,
  vLineColor: () => LINE,
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  fillColor: (row) => (row === 0 ? SOFT : null),
};

function signatureBlock(invoice) {
  const signer = [invoice.signatoryName, invoice.signatoryTitle].filter(Boolean);
  const signature = {
    width: "*",
    stack: [
      { text: "Исполнитель", bold: true, color: NAVY, fontSize: 12 },
      { text: " ", margin: [0, 16, 0, 0] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.6, lineColor: NAVY }] },
      { text: "Подпись", fontSize: 8, color: MUTED, margin: [0, 3, 0, 0] },
      ...signer.map((line, index) => ({
        text: line,
        fontSize: 10,
        color: index === 0 ? INK : MUTED,
        margin: [0, 2, 0, 0],
      })),
    ],
  };
  const columns = [signature];
  if (invoice.stampUsed) {
    columns.push({
      width: 170,
      stack: [
        { text: "Место для печати", fontSize: 10, color: MUTED },
        invoice.stampNote ? { text: invoice.stampNote, fontSize: 10, margin: [0, 6, 0, 0] } : { text: "", margin: [0, 18, 0, 0] },
      ],
    });
  }
  return { unbreakable: true, margin: [0, 28, 0, 0], columns };
}

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1) return null;
  return date;
}

function partyBlock(title, rows) {
  const filled = rows.filter(([, value]) => cleanText(value));
  return {
    stack: [
      { text: title, bold: true, color: NAVY, fontSize: 12, margin: [0, 0, 0, 4] },
      ...filled.map(([label, value]) => ({
        text: [{ text: `${label}: `, bold: true, color: NAVY }, cleanText(value)],
        fontSize: 10,
        margin: [0, 1, 8, 0],
      })),
    ],
  };
}

export function buildInvoicePdf(invoice) {
  const date = asDate(invoice.date);
  if (!date) {
    const error = pdfError("invalid");
    error.detail = "Укажите дату счёта.";
    throw error;
  }
  const lines = invoice.lines.map((line, index) => [
    { text: String(index + 1), alignment: "right", margin: [3, 4, 3, 4] },
    { text: line.title, margin: [3, 4, 3, 4] },
    { text: line.quantity, alignment: "right", margin: [3, 4, 3, 4] },
    { text: line.price, alignment: "right", margin: [3, 4, 3, 4] },
    { text: formatTenge(line.amountTiyn), alignment: "right", margin: [3, 4, 3, 4] },
  ]);
  const head = ["№", "Услуга", "Кол-во", "Цена, тенге", "Сумма, тенге"].map((text) => ({
    text,
    bold: true,
    color: NAVY,
    fontSize: 9,
    margin: [3, 4, 3, 4],
  }));
  const totals = [["Сумма", `${formatTenge(invoice.netTiyn)} тенге`]];
  if (invoice.vatPayer) totals.push([`НДС ${invoice.vatRate}%`, `${formatTenge(invoice.vatTiyn)} тенге`]);
  totals.push(["Итого к оплате", `${formatTenge(invoice.totalTiyn)} тенге`]);
  const content = [
    { text: "Счёт на оплату", fontSize: 22, bold: true, color: NAVY, margin: [0, 4, 0, 2] },
    {
      text: `№ ${invoice.number} от ${formatLongDate(date)}`,
      fontSize: 12,
      color: GREEN,
      margin: [0, 0, 0, 12],
    },
    {
      columns: [
        partyBlock("Исполнитель", [
          ["Наименование", invoice.executorName],
          ["ИИН/БИН", invoice.executorTaxId],
          ["Юридический адрес", invoice.address],
          ["Фактический адрес", invoice.actualAddress],
          ["ИИК", invoice.iik],
          ["БИК", invoice.bik],
          ["Банк", invoice.bank],
          ["КБе", invoice.kbe],
          ["Телефон", invoice.phone],
          ["Почта", invoice.email],
          ["Налоговый статус", invoice.vatPayer ? `Плательщик НДС${invoice.vatRate ? `, ставка ${invoice.vatRate}%` : ""}` : "Не является плательщиком НДС"],
        ]),
        partyBlock("Заказчик", [
          ["Наименование", invoice.customerName],
          ["ИИН/БИН", invoice.customerTaxId],
          ["Юридический адрес", invoice.customerAddress],
          ["Контактное лицо", invoice.customerContact],
          ["Телефон", invoice.customerPhone],
          ["Почта", invoice.customerEmail],
          ["ИИК", invoice.customerIik],
          ["БИК", invoice.customerBik],
          ["Банк", invoice.customerBank],
          ["КБе", invoice.customerKbe],
        ]),
      ],
      columnGap: 16,
      margin: [0, 0, 0, 12],
    },
    invoice.purpose
      ? {
          stack: [
            { text: "Назначение платежа", bold: true, color: NAVY, fontSize: 12, margin: [0, 0, 0, 3] },
            { text: invoice.purpose, margin: [0, 0, 0, 12] },
          ],
        }
      : { text: "", margin: [0, 0, 0, 2] },
    {
      table: { headerRows: 1, widths: [22, "*", 48, 78, 78], body: [head, ...lines] },
      layout: tableLayout,
      margin: [0, 0, 0, 10],
    },
    {
      table: {
        widths: ["*", "auto"],
        body: totals.map(([label, value], index) => {
          const last = index === totals.length - 1;
          return [
            { text: label, alignment: "right", bold: last, color: NAVY, fontSize: last ? 13 : 11, margin: [4, 3, 8, 3] },
            { text: value, alignment: "right", bold: last, noWrap: true, color: last ? GREEN : INK, fontSize: last ? 13 : 11, margin: [4, 3, 0, 3] },
          ];
        }),
      },
      layout: "noBorders",
    },
    {
      text: invoice.vatPayer
        ? "Цена указана без НДС. Сумма НДС рассчитана по ставке, указанной для налогового статуса исполнителя."
        : "НДС не выделяется: исполнитель не является плательщиком НДС.",
      fontSize: 9,
      color: MUTED,
      margin: [0, 8, 0, 0],
    },
    signatureBlock(invoice),
  ];
  return baseDocument(content, `Счёт на оплату № ${invoice.number}`);
}

export async function downloadInvoicePdf(input, leadId) {
  const prepared = prepareInvoice(input);
  if (!prepared.ok) {
    const error = pdfError("invalid");
    error.detail = prepared.message;
    throw error;
  }
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildInvoicePdf(prepared.invoice), invoiceFileName(prepared.invoice.date, leadId || prepared.invoice.number));
}

export async function downloadStoredInvoice(snapshot) {
  const date = asDate(snapshot?.date);
  if (!snapshot || !date) {
    const error = pdfError("invalid");
    error.detail = "Сохранённый счёт не удалось открыть.";
    throw error;
  }
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildInvoicePdf({ ...snapshot, date }), invoiceFileName(date, snapshot.number));
}
