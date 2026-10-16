import { NAVY, baseDocument, contactsSection, documentIntro } from "./documentTheme.js";
import { cleanText, formatLongDate, pdfError, registryFileName } from "./documentUtils.js";
import { leadCard } from "./leadPdf.js";

export function buildLeadsReport(leads, filterLabel, generatedAt = new Date()) {
  const list = Array.isArray(leads) ? leads : [];
  const label = cleanText(filterLabel) || "Все";
  const cards = list.map((lead) => leadCard(lead)).filter(Boolean);
  return baseDocument(
    [
      ...documentIntro(
        "Реестр заявок",
        `Фильтр: ${label}`,
        formatLongDate(generatedAt)
      ),
      { text: `Заявок в документе: ${list.length}`, bold: true, color: NAVY, margin: [0, 0, 0, 12] },
      ...cards,
      contactsSection(true),
    ],
    "Реестр заявок"
  );
}

export async function downloadLeadsReport(leads, filterLabel) {
  const list = Array.isArray(leads) ? leads : [];
  if (!list.length) throw pdfError("empty");
  const generatedAt = new Date();
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildLeadsReport(list, filterLabel, generatedAt), registryFileName(generatedAt));
}
