import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { chatChrome } from "../src/lib/assistantCopy.js";
import { createAssistantEngine, WHATSAPP_URL } from "../src/lib/assistantEngine.js";

const services = [
  { id: "audit", title: "Санитарный аудит объекта", description: "Осмотр объекта.", result: "Список замечаний" },
  { id: "inspection", title: "Подготовка к проверке СЭС", description: "Документы и журналы.", result: "Спокойная проверка" },
  { id: "control", title: "Производственный контроль", description: "Программа контроля.", result: "График исследований" },
  { id: "outbreak", title: "Документация, необходимая при проверках", description: "Перечень документов.", result: "Список документов" },
  { id: "consult", title: "Консультация и разбор предписания", description: "Разбор пунктов.", result: "Следующий шаг" },
  { id: "opening", title: "Открытие нового объекта", description: "Требования до ремонта.", result: "Перечень требований" },
];

function harness(initial = []) {
  const cart = [...initial];
  const calls = [];
  const engine = createAssistantEngine({
    services: () => services,
    hasService: (id) => cart.includes(id),
    addService: (id) => {
      calls.push(["add", id]);
      if (!cart.includes(id)) cart.push(id);
    },
    removeService: (id) => {
      calls.push(["remove", id]);
      const index = cart.indexOf(id);
      if (index >= 0) cart.splice(index, 1);
    },
    clearCart: () => {
      calls.push(["clear"]);
      cart.length = 0;
    },
  });
  return { engine, cart, calls };
}

function action(result, type) {
  return (result.actions || []).find((item) => item.type === type);
}

const illnessPhrases = [
  "отравились в столовой",
  "заболели люди на пищеблоке",
  "вспышка в кафе",
  "карантин в детском саду",
  "массовое отравление гостей",
  "инфекционное заболевание на объекте",
  "у нас заражение в садике",
  "очисти заказ, у нас отравление",
];

for (const phrase of illnessPhrases) {
  test(`болезнь важнее услуги: ${phrase}`, () => {
    const { engine, calls, cart } = harness(["audit"]);
    const result = engine.replyTo(phrase);
    assert.equal(calls.length, 0);
    assert.deepEqual(cart, ["audit"]);
    assert.match(result.text, /скорую/);
    assert.match(result.text, /служб/);
    assert.doesNotMatch(result.text, /работает с такими объектами/);
    assert.equal(action(result, "add"), undefined);
    assert.equal(action(result, "remove"), undefined);
    assert.equal(action(result, "clear"), undefined);
    assert.equal(action(result, "link")?.href, WHATSAPP_URL);
    assert.deepEqual(result.suggestions, []);
  });
}

test("слово эпидемиолог не считается вспышкой", () => {
  const { engine, calls } = harness(["audit"]);
  const result = engine.replyTo("Жанна эпидемиолог");
  assert.equal(calls.length, 0);
  assert.match(result.text, /эпидемиолог|эксперт|20 лет/);
  assert.doesNotMatch(result.text, /скорую/);
});

test("неясный вопрос честно отказывается и даёт WhatsApp", () => {
  const { engine, calls } = harness();
  const result = engine.replyTo("абракадабра xyz");
  assert.equal(calls.length, 0);
  assert.equal(result.matched, false);
  assert.match(result.text, /не понял/);
  assert.equal(action(result, "link")?.href, WHATSAPP_URL);
});

test("вопрос о снимке не выдумывает содержимое", () => {
  const { engine, calls } = harness();
  const result = engine.replyTo("что на фото");
  assert.equal(calls.length, 0);
  assert.match(result.text, /не буду/);
  assert.doesNotMatch(result.text, /вижу/i);
  assert.equal(action(result, "link")?.href, WHATSAPP_URL);
});

test("замечания после аудита не снимают услугу", () => {
  const { engine, calls, cart } = harness(["audit"]);
  const result = engine.replyTo("как убрать замечания после аудита");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit"]);
  assert.doesNotMatch(result.text, /больше не в заказе/);
  assert.equal(action(result, "remove"), undefined);
});

test("удалите документы не меняет корзину", () => {
  const { engine, calls, cart } = harness(["outbreak"]);
  const result = engine.replyTo("удалите документы");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["outbreak"]);
  assert.equal(action(result, "remove"), undefined);
  assert.doesNotMatch(result.text, /больше не в заказе/);
});

test("добавь аудит только предлагает кнопку", () => {
  const { engine, calls, cart } = harness();
  const result = engine.replyTo("добавь санитарный аудит");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, []);
  assert.equal(action(result, "add")?.id, "audit");
  assert.match(result.text, /Пока ничего не добавлено/);
});

test("закажи открытие не кладёт услугу само", () => {
  const { engine, calls } = harness();
  const result = engine.replyTo("закажи открытие");
  assert.equal(calls.length, 0);
  assert.equal(action(result, "add")?.id, "opening");
});

test("хочу аудит не меняет корзину", () => {
  const { engine, calls, cart } = harness();
  engine.replyTo("хочу санитарный аудит");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, []);
});

test("убрать из корзины ждёт кнопку", () => {
  const { engine, calls, cart } = harness(["audit", "opening"]);
  const result = engine.replyTo("убери аудит из корзины");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit", "opening"]);
  assert.equal(action(result, "remove")?.id, "audit");
  assert.match(result.text, /Пока ничего не изменено/);
});

test("очистить корзину ждёт кнопку", () => {
  const { engine, calls, cart } = harness(["audit"]);
  const result = engine.replyTo("очистить корзину");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit"]);
  assert.ok(action(result, "clear"));
  assert.match(result.text, /Пока ничего не удалено/);
});

test("удали все из заказа тоже ждёт кнопку", () => {
  const { engine, calls, cart } = harness(["audit", "consult"]);
  const result = engine.replyTo("удали все из заказа");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit", "consult"]);
  assert.ok(action(result, "clear"));
});

test("пустую корзину не предлагают очистить", () => {
  const { engine, calls } = harness();
  const result = engine.replyTo("очистить заказ");
  assert.equal(calls.length, 0);
  assert.equal(action(result, "clear"), undefined);
  assert.match(result.text, /пуст/);
});

test("повтор да не зацикливается", () => {
  const { engine } = harness();
  engine.setPending("да");
  const result = engine.replyTo("да");
  assert.equal(typeof result.text, "string");
  assert.match(result.text, /не понял|WhatsApp|уточн/i);
});

test("в коде консультанта нет загрузки скрипта с CDN", () => {
  const engineSource = fs.readFileSync(new URL("../src/lib/assistantEngine.js", import.meta.url), "utf8");
  const widgetSource = fs.readFileSync(new URL("../src/components/Assistant.jsx", import.meta.url), "utf8");
  const pdfSource = fs.readFileSync(new URL("../src/lib/pdfText.js", import.meta.url), "utf8");
  const combined = `${engineSource}\n${widgetSource}\n${pdfSource}`;
  assert.doesNotMatch(combined, /jsdelivr|unpkg|cdnjs|tesseract|createElement\("script"\)/i);
  assert.doesNotMatch(pdfSource, /https?:\/\//);
  assert.doesNotMatch(pdfSource, /fetch\(/);
  assert.doesNotMatch(widgetSource, /\.doc,/);
  assert.doesNotMatch(widgetSource, /\.xls,/);
});

test("поддельный PDF не получает выдуманный текст", async () => {
  const { engine, calls } = harness();
  const file = new File([Uint8Array.from([1, 2, 3, 4, 5])], "предписание.pdf", { type: "application/pdf" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /не PDF/);
  const reply = engine.replyAbout("", [reading]);
  assert.equal(calls.length, 0);
  assert.match(reply.text, /не PDF/);
  assert.match(reply.text, /не буду додумывать/);
  assert.equal(action(reply, "link")?.href, WHATSAPP_URL);
});

test("слишком большая картинка не открывается", async () => {
  const { engine } = harness();
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 20000);
  view.setUint32(20, 20000);
  const file = new File([bytes], "scan.png", { type: "image/png" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /слишком большое/);
});

test("обычный снимок не описывается по догадке", async () => {
  const { engine } = harness();
  const bytes = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ));
  const file = new File([bytes], "photo.png", { type: "image/png" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /не удалось/);
  assert.equal(reading.look, undefined);
  const reply = engine.replyAbout("посмотри фото", [reading]);
  assert.doesNotMatch(reply.text, /вижу|документ или скан|помещени/i);
  assert.equal(action(reply, "link")?.href, WHATSAPP_URL);
});

test("PDF с русским текстовым слоем читается локально", async () => {
  const { engine, calls } = harness();
  const fetches = [];
  const original = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetches.push(String(args[0]));
    throw new Error("network");
  };
  try {
    const file = new File([textLayerPdf(["Санитарный журнал для кафе. Проверка документов."])], "журнал.pdf", {
      type: "application/pdf",
    });
    const reading = await engine.readMaterial(file);
    assert.equal(reading.error, "");
    assert.match(reading.text, /Санитарный журнал для кафе/);
    assert.match(reading.text, /Проверка документов/);
    const reply = engine.replyAbout("", [reading]);
    assert.equal(calls.length, 0);
    assert.match(reply.text, /Санитарный журнал/);
    assert.match(reply.text, /не официальное санитарно-эпидемиологическое заключение/);
    assert.equal(fetches.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("PDF с казахским текстовым слоем сохраняет буквы", async () => {
  const { engine } = harness();
  const file = new File([textLayerPdf(["Қазақша мәтін. Журнал әғқңөұүһі."])], "қазақша.pdf", {
    type: "application/pdf",
  });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.error, "");
  assert.match(reading.text, /Қазақша мәтін/);
  assert.match(reading.text, /әғқңөұүһі/);
});

test("скан PDF без текстового слоя не выдумывается", async () => {
  const { engine, calls } = harness();
  const file = new File([emptyPdf()], "скан.pdf", { type: "application/pdf" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /нет текстового слоя/);
  const reply = engine.replyAbout("", [reading]);
  assert.equal(calls.length, 0);
  assert.match(reply.text, /WhatsApp|Жанне/);
  assert.match(reply.text, /не официальное санитарно-эпидемиологическое заключение/);
  assert.doesNotMatch(reply.text, /Санитарный аудит объекта/);
});

test("повреждённый PDF не получает выдуманный текст", async () => {
  const { engine } = harness();
  const file = new File([Buffer.from("%PDF-1.4\n<< повреждён")], "битый.pdf", { type: "application/pdf" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /повреждён|не PDF|не получилось/);
});

test("длинный PDF честно помечается как фрагмент", async () => {
  const { engine } = harness();
  const pages = Array.from({ length: 9 }, (_, index) => (index === 8 ? "ХвостДокумента" : `Лист ${index + 1}`));
  const file = new File([textLayerPdf(pages)], "длинный.pdf", { type: "application/pdf" });
  const reading = await engine.readMaterial(file);
  assert.match(reading.text, /Лист 1/);
  assert.doesNotMatch(reading.text, /ХвостДокумента/);
  assert.equal(reading.partial, true);
  const reply = engine.replyAbout("", [reading]);
  assert.match(reply.text, /только фрагмент/);
});

test("файл больше 8 МБ не открывается", async () => {
  const { engine } = harness();
  const bytes = new Uint8Array(8 * 1024 * 1024 + 1);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  const file = new File([bytes], "большой.pdf", { type: "application/pdf" });
  const reading = await engine.readMaterial(file);
  assert.equal(reading.text, "");
  assert.match(reading.error, /8 МБ/);
});

test("старые форматы doc и xls отклоняются", async () => {
  const { engine, calls } = harness();
  const doc = new File([Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0])], "акт.doc", { type: "application/msword" });
  const xls = new File([Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0])], "таблица.xls", { type: "application/vnd.ms-excel" });
  const docReading = await engine.readMaterial(doc);
  const xlsReading = await engine.readMaterial(xls);
  assert.equal(docReading.text, "");
  assert.equal(xlsReading.text, "");
  assert.match(docReading.error, /\.doc/);
  assert.match(xlsReading.error, /\.xls/);
  const reply = engine.replyAbout("", [docReading]);
  assert.equal(calls.length, 0);
  assert.equal(action(reply, "link")?.href, WHATSAPP_URL);
});

test("DOCX сохраняет русский и казахский текст", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Санитарный журнал. Қазақша мәтін.</w:t></w:r></w:p></w:body></w:document>`;
  const file = new File([storedZip("word/document.xml", xml)], "журнал.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const { engine } = harness();
  const reading = await engine.readMaterial(file);
  assert.equal(reading.error, "");
  assert.match(reading.text, /Санитарный журнал/);
  assert.match(reading.text, /Қазақша мәтін/);
});

test("текст файла про отравление не превращается в карточку кафе", () => {
  const { engine, calls } = harness();
  const reply = engine.replyAbout("", [
    { name: "жалоба.txt", kind: "file", text: "Отравились в столовой после завтрака", error: "" },
  ]);
  assert.equal(calls.length, 0);
  assert.match(reply.text, /скорую/);
  assert.doesNotMatch(reply.text, /работает с такими объектами/);
  assert.equal(action(reply, "add"), undefined);
});

const clientQuestions = [
  ["Аудит для кафе", /Санитарный аудит/, /проверка уже скоро|Стоимость зависит/],
  ["нужен аудит помещения кафе", /Санитарный аудит/, /работает с такими объектами: кафе/],
  ["адит для кофейни", /Санитарный аудит/, /не понял/],
  ["Подготовка к проверке кафе", /Подготовка к проверке/, /проверка уже скоро/],
  ["как подготовиться к проверке", /Подготовка к проверке/, /Стоимость зависит/],
  ["подгатовка к проверке сэс", /Подготовка к проверке/, /не понял/],
  ["Завтраки в кафе", /неясно|не делаю вывод/, /проверка уже скоро/],
  ["меню завтраков", /завтрак|меню/, /проверка уже скоро/],
  ["завтрак в кафе", /неясно|не делаю вывод/, /проверка уже скоро/],
  ["Как убрать замечания после аудита", /по пунктам/, /больше не в заказе|Санитарный аудит объекта/],
  ["как устранить нарушения на объекте", /по пунктам/, /теперь в заказе/],
  ["что делать с замечаниями инспектора", /по пунктам|список/, /Стоимость зависит/],
  ["Сценарий проверки", /Уточните/, /Стоимость зависит|тоную сумму|конкретную цену я не придумываю/],
  ["сценарий проверок для салона", /Уточните/, /Стоимость зависит/],
  ["Сколько стоит аудит", /не называю|не придумываю/, /\d+\s*тенге|стоит \d/],
  ["сколко стоит подготовка", /не называю|не придумываю/, /\d+\s*тенге/],
  ["какой прайс", /не придумываю|не называю/, /Санитарный аудит объекта/],
  ["какие документы нужны для кафе", /чек-лист|документ/, /Санитарный аудит объекта/],
  ["дакументы к проверке", /чек-лист|документ/, /Уточните, пожалуйста: подготовка/],
  ["какие журналы вести", /журнал|чек-лист/, /четыре шага/],
  ["как работать с журналом", /журнал|чек-лист/, /четыре шага/],
  ["медкнижки сотрудников", /медицинские книжки|чек-лист/, /скорую/],
  ["Какие услуги есть", /такие услуги/, /скорую/],
  ["производственный контроль для столовой", /Производственный контроль/, /скорую/],
  ["программа производственного контроля", /Производственный контроль/, /Стоимость зависит/],
  ["консультация по предписанию", /предписан/, /скорую/],
  ["предписание для клиники", /предписан/, /работает с такими объектами/],
  ["открытие нового кафе", /Открытие нового объекта/, /проверка уже скоро/],
  ["хочу открыть салон", /Открытие нового объекта/, /теперь в заказе/],
  ["Оставить заявку", /WhatsApp|заявк/, /скорую/],
  ["что писать в заявке", /заявк/, /скорую/],
  ["какой телефон", /777|WhatsApp/, /скорую/],
  ["кто такая Жанна", /эксперт|20 лет/, /скорую/],
  ["Жанна эпидемиолог с большим стажем", /эксперт|20 лет/, /скорую/],
  ["у меня кафе", /кафе и общественное питание/, /проверка уже скоро/],
  ["у меня парикмахерская", /салоны красоты/, /проверка уже скоро/],
  ["детский сад", /детские сады/, /скорую/],
  ["привет", /Здравствуйте/, /Санитарный аудит объекта/],
  ["привет, какие документы нужны", /чек-лист|документ/, /Могу подсказать услугу, документы к проверке или как оставить заявку/],
  ["спасибо большое", /Пожалуйста/, /Санитарный аудит/],
  ["онлайн можно разобрать документы", /онлайн можно/, /выезд нужен прямо сейчас/],
  ["как проходит работа", /четыре шага/, /скорую/],
  ["как вы работаете", /четыре шага/, /скорую/],
  ["что в корзине", /В заказе|пуст/, /теперь в заказе|больше не в заказе/],
  ["не аудит, а документы", /чек-лист|документ/, /Санитарный аудит объекта/],
  ["какой приказ нужен для кафе", /не называю номера приказов/, /№\s*\d|приказ\s+\d/],
  ["номер санпина для столовой", /не называю номера/, /№\s*\d/],
  ["гарантируете прохождение проверки", /не обещаю/, /без замечаний пройд/],
  ["санитарные нормы для салона", /не пересказываю/, /Санитарный аудит объекта/],
  ["какие нормы?", /не пересказываю/, /не понял/],
  ["это нормально для салона?", /не пересказываю|не заключение/, /салоны красоты и парикмахерские/],
  ["вопрос по позвоночнику", /не понял/, /777/],
  ["кафедра университета", /не понял/, /общественного питания/],
  ["видеонаблюдение в клинике", /медицинские организации|не понял/, /онлайн можно/],
  ["проверка завтра", /напишите сразу/, /Стоимость зависит/],
  ["срочно нужна подготовка к проверке", /Подготовка к проверке/, /тоную сумму/],
  ["шоколадный цех", /не понял/, /детские сады/],
  ["чек-лист на сайте", /чек-лист/, /скорую/],
  ["самопроверка перед инспектором", /чек-лист|самопровер|пробел/, /Стоимость зависит/],
  ["баня и сауна это ваш объект?", /бани и сауны/, /скорую/],
  ["фирма на складе, какие документы", /чек-лист|документ/, /Открытие нового объекта/],
  ["для склада нужны журналы", /журнал|чек-лист/, /Открытие нового объекта/],
];

for (const [phrase, must, forbid] of clientQuestions) {
  test(`вопрос клиента: ${phrase}`, () => {
    const { engine, calls, cart } = harness(["audit"]);
    const result = engine.replyTo(phrase);
    assert.equal(calls.length, 0, phrase);
    assert.deepEqual(cart, ["audit"]);
    assert.match(result.text, must, result.text);
    assert.doesNotMatch(result.text, forbid, result.text);
    assert.equal(action(result, "remove"), undefined);
    assert.equal(action(result, "clear"), undefined);
    if (/убрать замечания|устранить нарушения|замечаниями инспектора/.test(phrase)) {
      assert.equal(action(result, "add"), undefined);
    }
  });
}

function buildPdf(objects) {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function textLayerPdf(pages) {
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "2 beginbfrange",
    "<0000> <00FF> <0000>",
    "<0400> <04FF> <0400>",
    "endbfrange",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  const kids = [];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    `<< /Length ${Buffer.byteLength(cmap, "latin1")} >>\nstream\n${cmap}\nendstream`,
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 /CIDToGIDMap /Identity >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 3 0 R >>",
  ];
  for (const text of pages) {
    const hex = [...text].map((ch) => ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join("");
    const content = `BT /F1 12 Tf <${hex}> Tj ET`;
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const pageId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents ${contentId} 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
    kids.push(`${pageId} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  return buildPdf(objects);
}

function emptyPdf() {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Contents 4 0 R >>",
    "<< /Length 3 >>\nstream\n \nendstream",
  ]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function storedZip(name, text) {
  const data = Buffer.from(text, "utf8");
  const fileName = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const local = Buffer.alloc(30 + fileName.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  fileName.copy(local, 30);
  data.copy(local, 30 + fileName.length);
  const central = Buffer.alloc(46 + fileName.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);
  fileName.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

const kazakhQuestions = [
  ["Кафеге санитариялық аудит керек", "kk", /санитариялық аудит/, "audit"],
  ["Аудит керек", "kk", /санитариялық аудит/, "audit"],
  ["адит керек", "kk", /санитариялық аудит/, "audit"],
  ["санитарлык аудит керек", "kk", /санитариялық аудит/, "audit"],
  ["Тексеруге дайындық керек", "kk", /Тексеруге дайындық/, "inspection"],
  ["кафе тексеруге дайындау", "kk", /Тексеруге дайындық/, "inspection"],
  ["тексеры дайындык керек", "kk", /Тексеруге дайындық/, "inspection"],
  ["Таңғы ас мәзірі", "kk", /нақтылаңыз/],
  ["Ертең тексеру", "kk", /жақын/],
  ["ескерту жою", "kk", /Ескертулер/],
  ["Тексеру сценарийі", "kk", /Нақтылаңыз/],
  ["Аудит қанша тұрады", "kk", /нақты соманы айтпаймын/],
  ["канаша тұрады аудит", "kk", /нақты соманы айтпаймын/],
  ["кужаттар керек", "kk", /құжат/],
  ["Қандай құжат керек", "kk", /медициналық кітапша/],
  ["Медициналық кітапша керек", "kk", /медициналық кітапша/],
  ["Қандай қызмет бар", "kk", /сайтта мына қызметтер/],
  ["Өндірістік бақылау керек", "kk", /Өндірістік бақылау/, "control"],
  ["Нұсқаманы қарап бересіз бе", "kk", /нұсқама/, "consult"],
  ["Кафе ашқым келеді", "kk", /Жаңа нысанды ашу/, "opening"],
  ["Өтінім қалдырайын", "kk", /өзі жауап береді/],
  ["Жанна кім", "kk", /сарапшысы/],
  ["Сәлем", "kk", /Сәлеметсіз бе/],
  ["Рақмет сізге", "kk", /Рақмет/],
  ["қалай жұмыс істейсіз", "kk", /төрт қадам/],
  ["себетте не бар", "kk", /Тапсырыста/],
  ["құжат емес аудит керек", "kk", /санитариялық аудит/, "audit"],
  ["документы керек", "kk", /медициналық кітапша/],
  ["аудит үшін құжат керек", "kk", /медициналық кітапша/],
  ["Адамдар уланды асханада", "kk", /жедел жәрдем/],
  ["ауруханаға аудит керек", "kk", /санитариялық аудит/, "audit"],
  ["балабақшаға тексеруге дайындық", "kk", /Тексеруге дайындық/, "inspection"],
  ["шаштараз ашқым келеді", "kk", /Жаңа нысанды ашу/, "opening"],
  ["моншаға қандай талап бар", "kk", /Санитариялық талап/],
  ["тексеруге кепілдік бересіз бе", "kk", /уәде бермеймін/],
  ["бұйрықтың нөмірі қандай", "kk", /нөмірін айтпаймын/],
  ["суретте не бар", "kk", /болжамаймын/],
  ["тексеру", "kk", /Нақтылаңыз/],
  ["багасы канша", "kk", /Нақты бағаны ойдан шығармаймын|нақты соманы айтпаймын/],
  ["дамханага журнал керек", "kk", /журнал/],
  ["жаппай улану болды", "kk", /жедел жәрдем/],
  ["індет шықты балабақшада", "kk", /жедел жәрдем/],
  ["рахмет", "kk", /Рақмет/],
  ["қоймаға құжат керек", "kk", /құжат/],
  ["өндірістік бақылау бағдарламасы", "kk", /Өндірістік бақылау/, "control"],
  ["ескерту түзету", "kk", /Ескертулер/],
  ["онлайн құжат қарау", "kk", /онлайн болады/],
];

for (const [phrase, lang, pattern, serviceId] of kazakhQuestions) {
  test(`қазақша сұрақ: ${phrase}`, () => {
    const initial = serviceId ? [] : ["audit"];
    const { engine, calls, cart } = harness(initial);
    const result = engine.replyTo(phrase);
    assert.equal(calls.length, 0);
    assert.deepEqual(cart, initial);
    assert.equal(result.lang, lang);
    assert.match(result.text, pattern);
    assert.equal(action(result, "clear"), undefined);
    assert.equal(action(result, "remove"), undefined);
    if (serviceId) {
      assert.equal(action(result, "add")?.id, serviceId);
      assert.equal(action(result, "add")?.label, "Тапсырысқа қосу");
    } else if (/Нақтылаңыз|нақтылаңыз|жедел|Ескерту|уәде|нөмірін|болжамаймын|Тапсырыста|Рақмет|Сәлеметсіз|төрт қадам|сарапшы|ойдан шығармаймын|нақты сома/.test(pattern.source)) {
      assert.equal(action(result, "add"), undefined);
    }
    if (/қанша|канша|багасы|нөмірі/.test(phrase)) assert.doesNotMatch(result.text, /\d/);
    assert.doesNotMatch(result.text, /гарантир|100%/);
  });
}

test("себетті тазалау тек батырманы ұсынады", () => {
  const { engine, calls, cart } = harness(["audit", "opening"]);
  const result = engine.replyTo("себетті тазала");
  assert.equal(result.lang, "kk");
  assert.match(result.text, /ештеңе өшірілген жоқ/);
  assert.equal(action(result, "clear")?.type, "clear");
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit", "opening"]);
});

test("бос себетті тазалау батырмасын көрсетпейді", () => {
  const { engine, calls, cart } = harness();
  const result = engine.replyTo("себетті тазала");
  assert.equal(result.lang, "kk");
  assert.match(result.text, /тазалайтын ештеңе жоқ/);
  assert.equal(action(result, "clear"), undefined);
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, []);
});

test("қысқа иә алдыңғы қазақша сұрақтың тілін сақтайды", () => {
  const { engine, calls, cart } = harness(["audit"]);
  engine.replyTo("Кафеге санитариялық аудит керек");
  engine.setPending("Кафеге санитариялық аудит керек");
  const result = engine.replyTo("иә");
  assert.equal(result.lang, "kk");
  assert.match(result.text, /санитариялық аудит/);
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit"]);
});

test("ортақ сөз аудит қазақша әңгімені орысшаға аудармайды", () => {
  const { engine, calls, cart } = harness(["inspection"]);
  engine.replyTo("Қандай құжат керек");
  const result = engine.replyTo("аудит");
  assert.equal(result.lang, "kk");
  assert.match(result.text, /санитариялық аудит/);
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["inspection"]);
});

test("тіл ауысса таңдалған қызмет корзинада қалады", () => {
  const { engine, calls, cart } = harness(["audit", "opening"]);
  const kazakh = engine.replyTo("Қандай құжат керек");
  const russian = engine.replyTo("Какие документы нужны");
  assert.equal(kazakh.lang, "kk");
  assert.equal(russian.lang, "ru");
  assert.match(russian.text, /медицинские книжки|документ/);
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["audit", "opening"]);
});

test("смешанный вопрос о цене тексеру остаётся по-русски и без суммы", () => {
  const { engine, calls, cart } = harness(["control"]);
  const result = engine.replyTo("сколько стоит тексеру");
  assert.equal(result.lang, "ru");
  assert.match(result.text, /не придумываю|не называю/);
  assert.doesNotMatch(result.text, /\d/);
  assert.equal(action(result, "add"), undefined);
  assert.equal(calls.length, 0);
  assert.deepEqual(cart, ["control"]);
});

test("казахские подписи кнопок чата", () => {
  const kk = chatChrome("kk");
  const ru = chatChrome("ru");
  assert.equal(kk.send, "Жіберу");
  assert.equal(kk.close, "Жабу");
  assert.equal(kk.placeholder, "Сұрақ, файл немесе фото");
  assert.equal(kk.subtitle, "Қызметтер бойынша көмекші");
  assert.equal(kk.apply, "Өтінім қалдыру");
  assert.equal(kk.openCart, "Себетті ашу");
  assert.equal(ru.send, "Отправить");
  assert.equal(ru.close, "Закрыть");
  assert.equal(ru.placeholder, "Вопрос, файл или фото");
  assert.match(kk.added("Аудит"), /тапсырыста/);
  assert.doesNotMatch(kk.added("Аудит"), /\d/);
});
