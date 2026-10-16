import { CONTENT_WIDTH, GREEN, INK, LINE, NAVY, SOFT } from "./documentTheme.js";
import { cleanText } from "./documentUtils.js";

export function serviceBlock(service, index, options = {}) {
  const title = cleanText(service?.title);
  const description = cleanText(service?.description);
  const result = cleanText(service?.result);
  const stack = [];
  const inset = options.hideTitle ? 0 : 36;
  if (!options.hideTitle) {
    stack.push({
      columns: [
        {
          width: 36,
          text: String(index + 1).padStart(2, "0"),
          bold: true,
          color: GREEN,
          fontSize: 13,
        },
        title
          ? { width: "*", text: title, bold: true, color: NAVY, fontSize: 15 }
          : { width: "*", text: "" },
      ],
    });
  }
  if (description) {
    stack.push({ text: description, margin: [inset, inset ? 6 : 0, 0, 0] });
  }
  if (result) {
    stack.push({
      margin: [inset, 8, 0, 0],
      layout: "noBorders",
      table: {
        widths: ["*"],
        body: [[
          {
            fillColor: SOFT,
            margin: [8, 6, 8, 6],
            text: [
              { text: "Результат\n", bold: true, color: GREEN, fontSize: 9 },
              { text: result, color: INK, fontSize: 11 },
            ],
          },
        ]],
      },
    });
  }
  stack.push({
    margin: [0, 8, 0, 4],
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.4, lineColor: LINE }],
  });
  return { stack, unbreakable: true, margin: [0, 0, 0, 8] };
}
