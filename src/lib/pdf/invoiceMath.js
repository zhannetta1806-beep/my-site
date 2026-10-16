function parseDecimal(value, places) {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  if (whole.length > 12) return null;
  const kept = frac.slice(0, places);
  const roundDigit = frac[places] || "0";
  const scale = 10 ** places;
  const scaled = Number(whole) * scale + Number(kept || "0") * 10 ** (places - kept.length);
  if (!Number.isSafeInteger(scaled)) return null;
  return roundDigit >= "5" ? scaled + 1 : scaled;
}

function divideHalfUp(numerator, divisor) {
  if (!Number.isSafeInteger(numerator) || divisor <= 0) return null;
  const whole = Math.trunc(numerator / divisor);
  const remainder = numerator % divisor;
  return remainder * 2 >= divisor ? whole + 1 : whole;
}

export function lineAmountTiyn(quantity, price) {
  const qty = parseDecimal(quantity, 4);
  const unit = parseDecimal(price, 2);
  if (qty == null || unit == null || qty <= 0) return null;
  return divideHalfUp(qty * unit, 10000);
}

export function vatAmountTiyn(netTiyn, rate) {
  const percent = parseDecimal(rate, 2);
  if (percent == null || percent < 0 || percent > 10000) return null;
  if (!Number.isSafeInteger(netTiyn) || netTiyn < 0) return null;
  return divideHalfUp(netTiyn * percent, 10000);
}

export function formatTenge(tiyn) {
  const sign = tiyn < 0 ? "-" : "";
  const absolute = Math.abs(tiyn);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${fraction}`;
}

export function formatQuantity(quantity) {
  const scaled = parseDecimal(quantity, 4);
  if (scaled == null) return "";
  return (scaled / 10000).toFixed(4).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

function rawText(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function readText(value, limit) {
  const text = rawText(value);
  if (text.length > limit) return null;
  return text;
}

function optionalTaxId(value) {
  const text = rawText(value).replace(/\s/g, "");
  if (text.length > 20) return null;
  if (!text) return "";
  return /^\d{12}$/.test(text) ? text : null;
}

function optionalPhone(value) {
  const text = readText(value, 40);
  if (text == null) return null;
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (!/^[+\d][\d\s().-]*$/.test(text) || digits.length < 10 || digits.length > 15) return null;
  return text;
}

function optionalEmail(value) {
  const text = readText(value, 80);
  if (text == null) return null;
  if (!text) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? text : null;
}

function optionalIik(value) {
  const text = rawText(value).replace(/\s/g, "").toUpperCase();
  if (!text) return "";
  return /^KZ[A-Z0-9]{18}$/.test(text) ? text : null;
}

function optionalBik(value) {
  const text = rawText(value).replace(/\s/g, "").toUpperCase();
  if (text.length > 20) return null;
  if (!text) return "";
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(text) ? text : null;
}

function optionalKbe(value) {
  const text = rawText(value).replace(/\s/g, "");
  if (text.length > 10) return null;
  if (!text) return "";
  return /^\d{2}$/.test(text) ? text : null;
}

function pushText(errors, field, value, limit, messages) {
  const text = readText(value, limit);
  if (text == null) {
    errors.push({ field, message: messages.long });
    return "";
  }
  if (!text && messages.required) errors.push({ field, message: messages.required });
  return text;
}

export function prepareInvoice(input) {
  const source = input && typeof input === "object" ? input : {};
  const errors = [];
  const executorName = pushText(errors, "executorName", source.executorName, 180, {
    required: "Укажите наименование исполнителя.",
    long: "Наименование исполнителя — не длиннее 180 символов.",
  });
  const customerName = pushText(errors, "customerName", source.customerName, 180, {
    required: "Укажите наименование заказчика.",
    long: "Наименование заказчика — не длиннее 180 символов.",
  });
  const number = pushText(errors, "number", source.number, 40, {
    required: "Укажите номер счёта.",
    long: "Номер счёта — не длиннее 40 символов.",
  });
  if (number && !/^[\p{L}\p{N}][\p{L}\p{N}\s./-]*$/u.test(number)) {
    errors.push({ field: "number", message: "Номер счёта может содержать буквы, цифры, пробел, точку, дефис и слэш." });
  }
  const dateText = readText(source.date, 10);
  const dateMatch = dateText ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText) : null;
  const date = dateMatch ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])) : null;
  const dateValid = Boolean(date && !Number.isNaN(date.getTime()) && date.getFullYear() === Number(dateMatch[1]) && date.getMonth() === Number(dateMatch[2]) - 1 && date.getDate() === Number(dateMatch[3]));
  if (!dateValid) errors.push({ field: "date", message: "Укажите дату счёта." });

  const executorTaxId = optionalTaxId(source.executorTaxId);
  const customerTaxId = optionalTaxId(source.customerTaxId);
  if (executorTaxId == null) errors.push({ field: "executorTaxId", message: "ИИН или БИН исполнителя — 12 цифр. Пустое поле можно оставить пустым." });
  if (customerTaxId == null) errors.push({ field: "customerTaxId", message: "ИИН или БИН заказчика — 12 цифр. Пустое поле можно оставить пустым." });

  const address = pushText(errors, "address", source.address, 240, { long: "Юридический адрес исполнителя — не длиннее 240 символов." });
  const actualAddress = pushText(errors, "actualAddress", source.actualAddress, 240, { long: "Фактический адрес исполнителя — не длиннее 240 символов." });
  const bank = pushText(errors, "bank", source.bank, 160, { long: "Банк исполнителя — не длиннее 160 символов." });
  const phone = optionalPhone(source.phone);
  const email = optionalEmail(source.email);
  const iik = optionalIik(source.iik);
  const bik = optionalBik(source.bik);
  const kbe = optionalKbe(source.kbe);
  if (phone == null) errors.push({ field: "phone", message: "Телефон исполнителя: от 10 до 15 цифр, можно с +7, пробелами и скобками." });
  if (email == null) errors.push({ field: "email", message: "Почта исполнителя: укажите адрес в виде name@domain.kz." });
  if (iik == null) errors.push({ field: "iik", message: "ИИК исполнителя: 20 символов, начинается с KZ." });
  if (bik == null) errors.push({ field: "bik", message: "БИК исполнителя: 8 или 11 символов." });
  if (kbe == null) errors.push({ field: "kbe", message: "КБе исполнителя: две цифры." });

  const customerContact = pushText(errors, "customerContact", source.customerContact, 160, { long: "Контактное лицо заказчика — не длиннее 160 символов." });
  const customerAddress = pushText(errors, "customerAddress", source.customerAddress, 240, { long: "Адрес заказчика — не длиннее 240 символов." });
  const customerBank = pushText(errors, "customerBank", source.customerBank, 160, { long: "Банк заказчика — не длиннее 160 символов." });
  const customerPhone = optionalPhone(source.customerPhone);
  const customerEmail = optionalEmail(source.customerEmail);
  const customerIik = optionalIik(source.customerIik);
  const customerBik = optionalBik(source.customerBik);
  const customerKbe = optionalKbe(source.customerKbe);
  if (customerPhone == null) errors.push({ field: "customerPhone", message: "Телефон заказчика: от 10 до 15 цифр, можно с +7, пробелами и скобками." });
  if (customerEmail == null) errors.push({ field: "customerEmail", message: "Почта заказчика: укажите адрес в виде name@domain.kz." });
  if (customerIik == null) errors.push({ field: "customerIik", message: "ИИК заказчика: 20 символов, начинается с KZ." });
  if (customerBik == null) errors.push({ field: "customerBik", message: "БИК заказчика: 8 или 11 символов." });
  if (customerKbe == null) errors.push({ field: "customerKbe", message: "КБе заказчика: две цифры." });

  const purpose = pushText(errors, "purpose", source.purpose, 500, { long: "Назначение платежа — не длиннее 500 символов." });
  const signatoryName = pushText(errors, "signatoryName", source.signatoryName, 160, { long: "ФИО подписанта — не длиннее 160 символов." });
  const signatoryTitle = pushText(errors, "signatoryTitle", source.signatoryTitle, 160, { long: "Должность подписанта — не длиннее 160 символов." });
  const stampUsed = source.stampUsed === true;
  const stampNote = stampUsed
    ? pushText(errors, "stampNote", source.stampNote, 300, { long: "Сведения о печати — не длиннее 300 символов." })
    : "";

  if (source.vatStatus !== "vat" && source.vatStatus !== "none") {
    errors.push({ field: "vatStatus", message: "Выберите налоговый статус исполнителя." });
  }
  const vatPayer = source.vatStatus === "vat";

  const lines = Array.isArray(source.lines) ? source.lines : [];
  if (!lines.length) errors.push({ field: "lines", message: "Добавьте хотя бы одну позицию." });
  if (lines.length > 30) errors.push({ field: "lines", message: "В счёте не больше 30 позиций." });

  const prepared = [];
  lines.slice(0, 30).forEach((line, index) => {
    const title = readText(line?.title, 180);
    const position = index + 1;
    if (title == null) errors.push({ field: `title-${index}`, message: `Позиция ${position}: название — не длиннее 180 символов.` });
    else if (!title) errors.push({ field: `title-${index}`, message: `Позиция ${position}: укажите название услуги.` });
    const quantity = parseDecimal(line?.quantity, 4);
    const price = parseDecimal(line?.price, 2);
    if (quantity == null || quantity <= 0) errors.push({ field: `quantity-${index}`, message: `Позиция ${position}: укажите количество больше нуля.` });
    if (price == null) errors.push({ field: `price-${index}`, message: `Позиция ${position}: укажите цену числом.` });
    if (title && quantity != null && quantity > 0 && price != null) {
      const amount = lineAmountTiyn(line.quantity, line.price);
      if (amount == null) errors.push({ field: `price-${index}`, message: `Позиция ${position}: не удалось посчитать сумму.` });
      else {
        prepared.push({
          title,
          quantity: formatQuantity(line.quantity),
          price: formatTenge(price),
          amountTiyn: amount,
        });
      }
    }
  });

  let vatTiyn = 0;
  let vatRate = "";
  if (vatPayer) {
    const rateText = readText(source.vatRate, 20);
    const rate = rateText ? parseDecimal(rateText, 2) : null;
    if (rateText == null) errors.push({ field: "vatRate", message: "Ставка НДС — не длиннее 20 символов." });
    else if (rate == null) errors.push({ field: "vatRate", message: "Укажите ставку НДС. Если исполнитель не плательщик НДС, выберите этот статус." });
    else if (vatAmountTiyn(0, rateText) == null) errors.push({ field: "vatRate", message: "Ставка НДС должна быть от 0 до 100%." });
    else if (prepared.length === lines.length && lines.length > 0 && lines.length <= 30) {
      const netPreview = prepared.reduce((sum, line) => sum + line.amountTiyn, 0);
      vatTiyn = vatAmountTiyn(netPreview, rateText);
      vatRate = (rate / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
    }
  }

  if (errors.length) {
    return { ok: false, message: errors[0].message, errors: errors.map((item) => item.message), field: errors[0].field };
  }

  const netTiyn = prepared.reduce((sum, line) => sum + line.amountTiyn, 0);
  return {
    ok: true,
    invoice: {
      number,
      date,
      executorName,
      executorTaxId,
      address,
      actualAddress,
      iik,
      bik,
      bank,
      kbe,
      phone,
      email,
      customerName,
      customerContact,
      customerTaxId,
      customerAddress,
      customerPhone,
      customerEmail,
      customerIik,
      customerBik,
      customerBank,
      customerKbe,
      purpose,
      signatoryName,
      signatoryTitle,
      stampUsed,
      stampNote,
      vatPayer,
      vatRate,
      lines: prepared,
      netTiyn,
      vatTiyn,
      totalTiyn: netTiyn + vatTiyn,
    },
  };
}
