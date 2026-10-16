import { baseDocument, contactsSection, documentIntro } from "./documentTheme.js";
import { catalogFileName, formatLongDate, pdfError } from "./documentUtils.js";
import { serviceBlock } from "./serviceBlocks.js";

export function buildServiceCatalog(services, generatedAt = new Date()) {
  const list = Array.isArray(services) ? services : [];
  return baseDocument(
    [
      ...documentIntro(
        "Каталог санитарно-эпидемиологических услуг",
        "Санитарно-эпидемиологический аудит и консультационные услуги",
        formatLongDate(generatedAt)
      ),
      ...list.map((service, index) => serviceBlock(service, index)),
      contactsSection(true),
    ],
    "Каталог санитарно-эпидемиологических услуг"
  );
}

export async function downloadServiceCatalog(services) {
  const list = Array.isArray(services) ? services : [];
  if (!list.length) throw pdfError("empty");
  const generatedAt = new Date();
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildServiceCatalog(list, generatedAt), catalogFileName(generatedAt));
}
