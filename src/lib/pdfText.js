import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const maxPages = 8;
const maxChars = 20000;

export async function extractPdfText(bytes) {
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    disableAutoFetch: true,
    stopAtErrors: false,
    verbosity: 0,
    maxImageSize: 1024,
    enableXfa: false,
  });
  try {
    const doc = await task.promise;
    const pages = Math.min(doc.numPages || 0, maxPages);
    const parts = [];
    let length = 0;
    let partial = (doc.numPages || 0) > pages;
    for (let number = 1; number <= pages && length < maxChars; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items || []) {
        if (!item || typeof item.str !== "string") continue;
        pageText += item.str;
        if (item.hasEOL) pageText += "\n";
      }
      const clean = pageText.replace(/\s+/g, " ").trim();
      if (typeof page.cleanup === "function") page.cleanup();
      if (!clean) continue;
      const room = maxChars - length;
      if (clean.length > room) {
        parts.push(clean.slice(0, room));
        partial = true;
        break;
      }
      parts.push(clean);
      length += clean.length;
    }
    return { text: parts.join("\n").trim(), partial, broken: false };
  } catch {
    return { text: "", partial: false, broken: true };
  } finally {
    try {
      await task.destroy();
    } catch {
      /* разбор уже закрыт */
    }
  }
}
