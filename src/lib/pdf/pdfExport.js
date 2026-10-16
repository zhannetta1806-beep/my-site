import regularUrl from "./fonts/NotoSans-Regular.ttf?url";
import boldUrl from "./fonts/NotoSans-Bold.ttf?url";
import { pdfError } from "./documentUtils.js";

let loading = null;
let busy = false;

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

async function fontBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw pdfError("font");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw pdfError("font");
  return bytesToBase64(bytes);
}

function pdfMakeApi(imported) {
  if (imported && typeof imported.createPdf === "function") return imported;
  if (imported?.default && typeof imported.default.createPdf === "function") return imported.default;
  throw pdfError("font");
}

async function load() {
  const imported = await import("pdfmake/build/pdfmake");
  const pdfMake = pdfMakeApi(imported);
  const [regular, bold] = await Promise.all([fontBase64(regularUrl), fontBase64(boldUrl)]);
  pdfMake.addVirtualFileSystem({
    "NotoSans-Regular.ttf": regular,
    "NotoSans-Bold.ttf": bold,
  });
  pdfMake.addFonts({
    NotoSans: {
      normal: "NotoSans-Regular.ttf",
      bold: "NotoSans-Bold.ttf",
      italics: "NotoSans-Regular.ttf",
      bolditalics: "NotoSans-Bold.ttf",
    },
  });
  return pdfMake;
}

export function loadPdfMake() {
  if (!loading) {
    loading = load().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export async function downloadPdf(docDefinition, filename) {
  if (busy) throw pdfError("busy");
  busy = true;
  try {
    const pdfMake = await loadPdfMake();
    const document = pdfMake.createPdf(docDefinition);
    if (typeof document.download !== "function") throw pdfError("download");
    await document.download(filename);
  } catch (error) {
    if (!error.code) error.code = error.message === "font" ? "font" : "generate";
    throw error;
  } finally {
    busy = false;
  }
}
