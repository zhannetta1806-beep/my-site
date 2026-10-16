import { baseDocument, contactsSection, documentIntro } from "./documentTheme.js";
import { cleanText, formatLongDate, pdfError, serviceFileName } from "./documentUtils.js";
import { serviceBlock } from "./serviceBlocks.js";

export function buildServicePdf(service, generatedAt = new Date()) {
  const title = cleanText(service?.title) || "Услуга";
  return baseDocument(
    [
      ...documentIntro(
        title,
        "Санитарно-эпидемиологический аудит и консультационные услуги",
        formatLongDate(generatedAt)
      ),
      serviceBlock(service, 0, { hideTitle: true }),
      contactsSection(true),
    ],
    title
  );
}

export async function downloadServicePdf(service) {
  if (!service || typeof service !== "object") throw pdfError("empty");
  const generatedAt = new Date();
  const { downloadPdf } = await import("./pdfExport.js");
  await downloadPdf(buildServicePdf(service, generatedAt), serviceFileName(service.title));
}
