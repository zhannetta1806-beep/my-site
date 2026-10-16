import test from "node:test";
import assert from "node:assert/strict";
import { leadFailureText } from "../src/lib/leadErrors.js";

test("ошибка сервера не звучит как успешный заказ и напоминает про корзину", () => {
  assert.equal(
    leadFailureText({ ok: false, status: 0 }, { keepCart: true }),
    "Сервер сейчас недоступен. Заказ не сохранён, корзина на месте. Попробуйте ещё раз."
  );
  assert.equal(
    leadFailureText({ ok: false, status: 500 }, { keepCart: true }),
    "Не получилось сохранить заказ. Корзина не изменена. Попробуйте ещё раз."
  );
  assert.equal(
    leadFailureText({ ok: false, status: 429 }),
    "Слишком много заявок. Подождите и попробуйте снова."
  );
});
