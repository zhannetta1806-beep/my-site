export const KK_STARTER = ["Қандай қызмет бар?", "Қандай құжат керек?", "Қанша тұрады?", "Өтінім қалдыру"];

const KK_LETTERS = /[әғқңөұүһі]/;

const ACK = new Set([
  "да", "иә", "ия", "иа", "ок", "окей", "хорошо", "жарайды", "жараиды",
  "ага", "әрине", "арине", "мақұл", "макул", "ях", "угу",
]);

const KK_GRAMMAR = ["керек", "ушин", "канша", "калай", "кандай", "салем", "ракмет", "рахмет", "емес", "жок", "гои"];

const KK_STEMS = [
  "тексер", "кужат", "багас", "дайынд", "талап", "ескерт", "нысан", "санитариял", "санитарлык",
  "шугыл", "ертен", "тангы", "танертен", "баклау", "ондир", "балабакш", "дамхана",
  "мейрамхана", "асхана", "шаштараз", "емхана", "аурухана", "монша", "нускама",
  "себет", "отиним", "отиниш", "хабарлас", "ашу", "козга", "бузуш", "кемшил", "сурет", "жаппай", "улану", "индет",
];

const RU_GRAMMAR = [
  "сколько", "стоит", "стоимост", "какие", "какой", "какая", "нужно", "нужен", "нужна", "нужны",
  "подготов", "проверк", "заявк", "здравствуй", "привет", "корзин", "заказ", "документ",
  "норм", "приказ", "гарант", "обещ", "что", "как", "услуг", "замечан",
];

export function foldKk(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ә/g, "а")
    .replace(/ғ/g, "г")
    .replace(/қ/g, "к")
    .replace(/ң/g, "н")
    .replace(/ө/g, "о")
    .replace(/ұ/g, "у")
    .replace(/ү/g, "у")
    .replace(/һ/g, "х")
    .replace(/і/g, "и");
}

function tokensOf(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-яәғқңөұүһі0-9+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function hits(tokens, stems) {
  return stems.reduce((count, stem) => count + (tokens.some((token) => token === stem || token.startsWith(stem)) ? 1 : 0), 0);
}

export function detectLanguage(raw, previous = "ru") {
  const prior = previous === "kk" ? "kk" : "ru";
  const tokens = tokensOf(raw);
  if (!tokens.length) return prior;
  const folded = tokens.map((token) => foldKk(token));
  if (tokens.length <= 2 && tokens.every((token, index) => ACK.has(token) || ACK.has(folded[index]))) return prior;
  const letters = KK_LETTERS.test(tokens.join(" ")) ? 2 : 0;
  const kkScore = letters + hits(folded, KK_GRAMMAR) + hits(folded, KK_STEMS);
  const ruScore = hits(folded, RU_GRAMMAR);
  const kkParticle = folded.some((token) => KK_GRAMMAR.some((stem) => token === stem || token.startsWith(stem)));
  if (kkScore === 0 && ruScore === 0) return prior;
  if (kkParticle && kkScore >= ruScore) return "kk";
  if (letters > 0 && kkScore >= ruScore) return "kk";
  if (kkScore > 0 && ruScore === 0) return "kk";
  if (ruScore > 0 && kkScore === 0) return "ru";
  return kkScore > ruScore ? "kk" : "ru";
}

const SERVICES = {
  audit: {
    title: "Нысанның санитариялық аудиті",
    text: "Нысанды инспектордың көзімен қараймын: үй-жай, жабдық, ағындар, сақтау және құжаттар. Нәтижесі — жазбаша ескертулер тізімі және әрқайсысымен не істеу керек екені.",
  },
  inspection: {
    title: "Тексеруге дайындық",
    text: "Құжаттар мен журналдарды ретке келтіреміз, инспекторға нені және қалай көрсету керегін талдаймыз. Нәтижесі — тексеруге дайындалған құжаттар жинағы.",
  },
  control: {
    title: "Өндірістік бақылау",
    text: "Нысанға сай өндірістік бақылау бағдарламасын құрамын және оны қалай жүргізу керегін түсіндіремін. Нәтижесі — бағдарлама және зертханалық зерттеу кестесі.",
  },
  outbreak: {
    title: "Тексеруге қажетті құжаттар",
    text: "Сіздің нысанда тексеруге қандай құжат, журнал және шарт дайын тұруы керек екенін ажыратамын. Нәтижесі — құжаттар тізбесі.",
  },
  consult: {
    title: "Консультация және нұсқаманы талдау",
    text: "Нұсқаманы немесе санитариялық талап бойынша даулы мәселені тармақтап қараймын. Нәтижесі — түсінікті келесі қадам.",
  },
  opening: {
    title: "Жаңа нысанды ашу",
    text: "Кафе, салон, балабақша немесе қойма болсын — жөндеуге дейін қандай санитариялық талапты ескеру керегін айтамын. Нәтижесі — талаптар тізбесі.",
  },
};

export function serviceLabel(lang, service) {
  if (!service) return "";
  if (lang === "kk" && SERVICES[service.id]) return SERVICES[service.id].title;
  return service.title;
}

export function serviceBlurb(lang, service) {
  if (lang === "kk" && SERVICES[service.id]) return `${SERVICES[service.id].title}. ${SERVICES[service.id].text}`;
  return `${service.title}. ${service.description} На выходе: ${service.result}.`;
}

export function chatChrome(lang) {
  if (lang === "kk") {
    return {
      title: "СЭС көмекшісі",
      subtitle: "Қызметтер бойынша көмекші",
      close: "Жабу",
      send: "Жіберу",
      placeholder: "Сұрақ, файл немесе фото",
      question: "Сұрағыңыз",
      attach: "Файл немесе сурет тіркеу",
      attachTitle: "Файл немесе сурет",
      file: "Файл",
      image: "Сурет",
      imageAlt: "Сурет",
      fileLabel: "Файл",
      openLabel: "Чатты ашу: СЭС көмекшісі",
      closeLabel: "Чатты жабу: СЭС көмекшісі",
      tooMany: "4 файлдан артық тіркеуге болмайды.",
      emptyFile: (name) => `«${name}» бос.`,
      tooBig: (name) => `«${name}» 8 МБ-тан үлкен.`,
      blocked: (name, ext) => `«${name}» .${ext} форматын оқымаймын. PDF немесе DOCX тіркеңіз.`,
      removeFile: (name) => `${name} файлын алып тастау`,
      fail: "Хабарды өңдеу мүмкін болмады. Файл болса, мазмұнын ойдан шығармаймын. Сұрақты жазыңыз немесе файлды Жаннаға WhatsApp арқылы жіберіңіз.",
      cleared: "Тапсырыс тазартылды.",
      services: "Қызметтер",
      openCart: "Себетті ашу",
      notInCart: (title) => `«${title}» тапсырыста жоқ.`,
      removed: (title) => `«${title}» тапсырыстан алынды.`,
      already: (title) => `«${title}» тапсырыста бар.`,
      apply: "Өтінім қалдыру",
      added: (title) => `«${title}» енді тапсырыста. Құнын Жанна жұмыс басталмас бұрын айтады.`,
      chips: ["Өтінім қалдыру", "Қандай құжат керек?"],
      follow: "Өтінім қалдыру",
      inCart: "Тапсырыста бар",
      gone: "Тапсырыста жоқ",
    };
  }
  return {
    title: "СЭС помощник",
    subtitle: "Помощник по услугам",
    close: "Закрыть",
    send: "Отправить",
    placeholder: "Вопрос, файл или фото",
    question: "Ваш вопрос",
    attach: "Прикрепить файл или изображение",
    attachTitle: "Файл или изображение",
    file: "Файл",
    image: "Изображение",
    imageAlt: "Изображение",
    fileLabel: "Файл",
    openLabel: "Открыть чат: СЭС помощник",
    closeLabel: "Закрыть чат: СЭС помощник",
    tooMany: "Можно приложить не больше 4 файлов.",
    emptyFile: (name) => `«${name}» пустой.`,
    tooBig: (name) => `«${name}» больше 8 МБ.`,
    blocked: (name, ext) => `«${name}» в формате .${ext} не читаю. Приложите PDF или DOCX.`,
    removeFile: (name) => `Убрать ${name}`,
    fail: "Не удалось обработать сообщение. Если это был файл, я не буду додумывать его содержание. Напишите вопрос текстом или отправьте файл Жанне в WhatsApp.",
    cleared: "Заказ очищен.",
    services: "Услуги",
    openCart: "Открыть корзину",
    notInCart: (title) => `«${title}» в заказе нет.`,
    removed: (title) => `«${title}» убрана из заказа.`,
    already: (title) => `«${title}» уже в заказе.`,
    apply: "Оформить заявку",
    added: (title) => `«${title}» теперь в заказе. Стоимость Жанна назовёт до начала работы.`,
    chips: ["Оставить заявку", "Какие документы нужны?"],
    follow: "Оставить заявку",
    inCart: "Уже в заказе",
    gone: "Уже нет в заказе",
  };
}
