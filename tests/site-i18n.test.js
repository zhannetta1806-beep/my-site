import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { OBJECT_TYPES } from "../src/lib/site.js";
import {
  leadText,
  list,
  objectChoices,
  objectLabel,
  presentService,
  text,
} from "../src/lib/siteCopy.js";

const keys = [
  "metaTitle", "heroTitle", "heroLead", "navServices", "navObjects", "navProcess",
  "navAbout", "navChecklist", "navFaq", "navRequest", "arrange", "addCart",
  "cart", "leaveRequest", "orderTitle", "requestTitle", "close", "consult",
];

test("подписи RU и KZ есть для разделов сайта", () => {
  for (const key of keys) {
    assert.equal(typeof text("ru", key), "string");
    assert.equal(typeof text("kk", key), "string");
    assert.notEqual(text("ru", key), text("kk", key));
  }
  for (const key of ["objects", "steps", "principles", "checks", "faq", "objectsSelect", "verdicts"]) {
    assert.equal(list("ru", key).length, list("kk", key).length);
  }
  assert.equal(list("ru", "checks").length, 8);
});

test("казахские названия услуг не меняют каталог и не придумываются для своих услуг", () => {
  const source = fs.readFileSync(new URL("../src/lib/services.js", import.meta.url), "utf8");
  const original = [
    { id: "audit", title: "Санитарный аудит объекта", description: "Прихожу и смотрю на объект как инспектор: помещения, оборудование, потоки, хранение, документы.", result: "Письменный список замечаний и что с каждым делать" },
    { id: "inspection", title: "Подготовка к проверке СЭС", description: "Приводим в порядок документы и журналы, разбираем, что и как показывать инспектору.", result: "Спокойная проверка без сюрпризов" },
    { id: "control", title: "Производственный контроль", description: "Составлю программу производственного контроля под ваш объект и объясню, как её выполнять.", result: "Программа и график лабораторных исследований" },
    { id: "outbreak", title: "Документация, необходимая при проверках", description: "Разберу, какие документы, журналы и договоры должны быть готовы к проверке на вашем объекте.", result: "Перечень документов и что проверить в каждом" },
    { id: "consult", title: "Консультация и разбор предписания", description: "Разберу предписание или спорный вопрос по санитарным нормам пункт за пунктом.", result: "Ясный ответ и следующий шаг" },
    { id: "opening", title: "Открытие нового объекта", description: "Кафе, салон, детский центр, склад — подскажу, какие требования учесть ещё до ремонта.", result: "Перечень требований до того, как вложены деньги" },
  ];
  for (const service of original) {
    assert.ok(source.includes(service.title));
    const shown = presentService(service, "kk");
    assert.notEqual(shown.title, service.title);
    assert.equal(presentService(service, "ru").title, service.title);
  }
  const custom = { id: "audit", title: "Мой аудит", description: original[0].description, result: original[0].result };
  assert.equal(presentService(custom, "kk").title, "Мой аудит");
  assert.equal(presentService({ id: "custom", title: "Особая услуга", description: "", result: "" }, "kk").title, "Особая услуга");
});

test("тип объекта в заявке остаётся прежним значением для CRM", () => {
  const choices = objectChoices("kk");
  assert.deepEqual(choices.map((item) => item.value), [...OBJECT_TYPES]);
  assert.equal(objectLabel(OBJECT_TYPES[1], "kk"), "Кафе және қоғамдық тамақтану");
  assert.notEqual(choices[1].label, choices[1].value);
  assert.equal(objectLabel(OBJECT_TYPES[1], "ru"), OBJECT_TYPES[1]);
});

test("русские сообщения об ошибке заявки не изменились", () => {
  assert.equal(leadText({ status: 429 }, { lang: "ru" }), "Слишком много заявок. Подождите и попробуйте снова.");
  assert.equal(
    leadText({ status: 0 }, { keepCart: true, lang: "ru" }),
    "Сервер сейчас недоступен. Заказ не сохранён, корзина на месте. Попробуйте ещё раз."
  );
  assert.match(leadText({ status: 500 }, { lang: "kk" }), /сақтау мүмкін болмады/);
});
