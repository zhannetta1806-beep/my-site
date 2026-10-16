import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { useI18n } from "../context/LanguageContext";
import { chatChrome, serviceLabel } from "../lib/assistantCopy";
import {
  ASSISTANT_STORAGE_KEY,
  WHATSAPP_URL,
  createAssistantEngine,
} from "../lib/assistantEngine";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import { useSite } from "../context/SiteContext";

function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(ASSISTANT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function allowedLink(href) {
  return typeof href === "string" && (href.startsWith("#") || href === WHATSAPP_URL);
}

function safeActions(actions) {
  if (!Array.isArray(actions)) return undefined;
  return actions
    .filter((action) => action && typeof action === "object" && typeof action.type === "string" && typeof action.label === "string")
    .slice(0, 4)
    .map((action) => {
      const label = action.label.slice(0, 80);
      if (action.type === "link") return allowedLink(action.href) ? { type: "link", label, href: action.href } : null;
      if ((action.type === "add" || action.type === "remove") && typeof action.id === "string") {
        return { type: action.type, label, id: action.id.slice(0, 80) };
      }
      if (action.type === "cart" || action.type === "clear") return { type: action.type, label };
      return null;
    })
    .filter(Boolean);
}

function restoreChat(engine) {
  const saved = loadSaved();
  const hello = engine.welcome();
  if (Array.isArray(saved?.messages) && saved.messages.length) {
    const messages = saved.messages
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string")
      .slice(-40)
      .map((item) => ({
        role: item.role,
        text: item.text,
        actions: safeActions(item.actions),
        files: Array.isArray(item.files)
          ? item.files
              .filter((file) => file && typeof file.name === "string")
              .slice(0, 4)
              .map((file) => ({
                name: engine.safeName(file.name),
                kind: file.kind === "image" ? "image" : "file",
                preview: typeof file.preview === "string" && file.preview.startsWith("data:image/") ? file.preview : "",
                look: typeof file.look === "string" ? file.look.slice(0, 600) : "",
              }))
          : undefined,
      }));
    const chips = Array.isArray(saved.chips) && saved.chips.length ? saved.chips.filter((item) => typeof item === "string") : engine.starter;
    const follow = typeof saved.pending === "string" ? saved.pending : "";
    engine.setPending(follow);
    for (const message of messages) {
      for (const file of message.files || []) engine.rememberImage(file);
    }
    const lang = saved.lang === "kk" ? "kk" : "ru";
    engine.setLang(lang);
    return { messages, chips, follow, fresh: !saved.seen, lang };
  }
  return {
    messages: [{ role: "assistant", text: hello.text, actions: hello.actions }],
    chips: hello.suggestions,
    follow: "",
    fresh: true,
    lang: "ru",
  };
}

const FILE_WAIT_MS = 12000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function Assistant() {
  const site = useSite();
  const { lang: siteLang } = useI18n();
  const { registerAssistant } = site;
  const siteRef = useRef(site);
  siteRef.current = site;
  const openRef = useRef(false);
  const engine = useMemo(
    () =>
      createAssistantEngine({
        services: () => siteRef.current.services,
        hasService: (id) => siteRef.current.cartIds.includes(id),
        addService: (id) => siteRef.current.addService(id),
        removeService: (id) => siteRef.current.removeService(id),
        clearCart: () => siteRef.current.clearCart(),
      }),
    []
  );
  const initial = useMemo(() => restoreChat(engine), [engine]);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [open, setOpen] = useState(false);
  openRef.current = open;
  const [fresh, setFresh] = useState(initial.fresh);
  const [messages, setMessages] = useState(initial.messages);
  const [chips, setChips] = useState(initial.chips);
  const [follow, setFollow] = useState(initial.follow);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [note, setNote] = useState("");
  const [dropping, setDropping] = useState(false);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState(false);
  const [lang, setLang] = useState(initial.lang || "ru");
  const chrome = chatChrome(lang);
  const messagesRef = useRef(initial.messages);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const menuRef = useRef(null);
  const plusRef = useRef(null);
  const pickerRef = useRef(false);
  const attachmentsRef = useRef([]);
  const busyRef = useRef(false);
  const seq = useRef(0);
  const alive = useRef(true);
  attachmentsRef.current = attachments;
  busyRef.current = busy;
  pickerRef.current = picker;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    engine.setLang(siteLang);
    setLang(siteLang);
    const current = messagesRef.current;
    if (current.length === 1 && current[0].role === "assistant") {
      const hello = engine.welcome();
      setMessages([{ role: "assistant", text: hello.text, actions: hello.actions }]);
      setChips(hello.suggestions);
    }
  }, [siteLang, engine]);

  useEffect(() => {
    registerAssistant({ close: () => setOpen(false) });
    return () => registerAssistant(null);
  }, [registerAssistant]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const item of attachmentsRef.current) {
        if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
      }
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return undefined;
    const apply = () => {
      root.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--vv-top", `${Math.round(viewport.offsetTop)}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        ASSISTANT_STORAGE_KEY,
        JSON.stringify({
          messages: messages.slice(-40).map((message) => ({
            role: message.role,
            text: message.text,
            actions: message.actions,
            files: (message.files || []).map((file) => ({
              name: file.name,
              kind: file.kind === "image" ? "image" : "file",
              preview: typeof file.preview === "string" && file.preview.startsWith("data:image/") ? file.preview : "",
              look: typeof file.look === "string" ? file.look.slice(0, 600) : "",
            })),
          })),
          chips,
          pending: follow,
          seen: !fresh,
          lang,
        })
      );
    } catch {
      /* история чата необязательна */
    }
  }, [messages, chips, follow, fresh, lang]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const next = Math.min(input.scrollHeight, 104);
    input.style.height = `${next}px`;
    input.style.overflowY = input.scrollHeight > 108 ? "auto" : "hidden";
  }, [draft, open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
    const onClick = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setPicker(false);
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (pickerRef.current) {
        event.preventDefault();
        setPicker(false);
        return;
      }
      const current = siteRef.current;
      if (current.cartOpen || current.requestOpen || current.orderItems?.length) return;
      event.preventDefault();
      setPicker(false);
      setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!picker) return undefined;
    const onPointer = (event) => {
      if (menuRef.current?.contains(event.target) || plusRef.current?.contains(event.target)) return;
      setPicker(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [picker]);

  useEffect(() => {
    if (open) return undefined;
    if (rootRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    return undefined;
  }, [open]);

  const push = (message) => {
    setMessages((current) => [...current, message].slice(-40));
  };

  const rememberFollow = (value) => {
    const next = value || "";
    engine.setPending(next);
    setFollow(next);
  };

  const addFiles = (list) => {
    const incoming = [...list];
    if (!incoming.length || busyRef.current) return;
    const errors = [];
    const next = [...attachmentsRef.current];
    for (const file of incoming) {
      if (next.length >= engine.maxFiles) {
        errors.push(chrome.tooMany);
        break;
      }
      if (!file.size) {
        errors.push(chrome.emptyFile(engine.safeName(file.name)));
        continue;
      }
      if (file.size > engine.maxBytes) {
        errors.push(chrome.tooBig(engine.safeName(file.name)));
        continue;
      }
      const blocked = engine.blockedExt(file.name);
      if (blocked) {
        errors.push(chrome.blocked(engine.safeName(file.name), blocked));
        continue;
      }
      const image = engine.isImageFile(file);
      seq.current += 1;
      next.push({
        id: seq.current,
        file,
        name: engine.safeName(file.name),
        kind: image ? "image" : "file",
        preview: image ? URL.createObjectURL(file) : "",
      });
    }
    attachmentsRef.current = next;
    setAttachments(next);
    setNote(errors[0] || "");
  };

  const clearAttachments = () => {
    for (const item of attachmentsRef.current) {
      if (item.preview) URL.revokeObjectURL(item.preview);
    }
    attachmentsRef.current = [];
    setAttachments([]);
    setNote("");
  };

  const go = (href) => {
    if (!allowedLink(href)) return;
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    if (href === "#contact") {
      if (narrow) setOpen(false);
      siteRef.current.openRequest();
      return;
    }
    if (href.startsWith("#")) {
      if (narrow) setOpen(false);
      document.querySelector(href)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const send = async (text, files) => {
    const clean = text.trim().slice(0, 500);
    const batch = files.slice(0, engine.maxFiles);
    if ((!clean && !batch.length) || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const deadline = Date.now() + FILE_WAIT_MS;
    const budget = (promise) => withTimeout(promise, Math.max(1, deadline - Date.now()));
    let shown = [];
    try {
      shown = await budget(Promise.all(batch.map((file) => engine.presentFile(file))));
    } catch {
      shown = batch.map((file) => ({ name: engine.safeName(file.name), kind: "file", preview: "" }));
    }
    if (!alive.current) return;
    push({ role: "user", text: clean, files: shown });
    setDraft("");
    setTyping(true);
    try {
      let result;
      if (batch.length) {
        const readings = [];
        for (const file of batch) {
          if (Date.now() >= deadline) throw new Error("timeout");
          readings.push(await budget(engine.readMaterial(file)));
        }
        setMessages((current) => {
          const next = [...current];
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (next[index].role !== "user") continue;
            next[index] = {
              ...next[index],
              files: (next[index].files || []).map((file, fileIndex) => ({
                ...file,
                look: typeof readings[fileIndex]?.look === "string" ? readings[fileIndex].look.slice(0, 600) : file.look || "",
              })),
            };
            break;
          }
          return next;
        });
        result = engine.replyAbout(clean, readings);
      } else {
        result = engine.replyTo(clean);
      }
      const nextChips = Array.isArray(result.suggestions)
        ? result.suggestions.filter((item) => typeof item === "string").slice(0, 6)
        : engine.starter;
      setChips(nextChips);
      if (result.lang === "kk" || result.lang === "ru") setLang(result.lang);
      rememberFollow(result.follow || "");
      const wait = reduced ? 0 : Math.min(900, 360 + Math.min(result.text.length, 80) * 5);
      await new Promise((resolve) => window.setTimeout(resolve, wait));
      if (!alive.current) return;
      setTyping(false);
      push({ role: "assistant", text: result.text, actions: result.actions || [] });
    } catch {
      if (!alive.current) return;
      setTyping(false);
      push({
        role: "assistant",
        text: chrome.fail,
        actions: [{ type: "link", label: "WhatsApp", href: WHATSAPP_URL }],
      });
    }
    if (!alive.current) return;
    busyRef.current = false;
    setBusy(false);
    if (openRef.current) inputRef.current?.focus({ preventScroll: true });
  };

  const onAction = (action) => {
    if (busyRef.current) return;
    if (action.type === "link" && action.href) {
      go(action.href);
      return;
    }
    if (action.type === "cart") {
      setOpen(false);
      siteRef.current.openCart();
      return;
    }
    if (action.type === "clear") {
      siteRef.current.clearCart();
      push({
        role: "assistant",
        text: chrome.cleared,
        actions: [{ type: "link", label: chrome.services, href: "#services" }],
      });
      return;
    }
    if (action.type === "remove") {
      const service = siteRef.current.services.find((item) => item.id === action.id);
      if (!service) return;
      const name = serviceLabel(lang, service);
      if (!siteRef.current.cartIds.includes(service.id)) {
        push({ role: "assistant", text: chrome.notInCart(name), actions: [] });
        return;
      }
      siteRef.current.removeService(service.id);
      push({
        role: "assistant",
        text: chrome.removed(name),
        actions: [{ type: "cart", label: chrome.openCart }],
      });
      return;
    }
    if (action.type !== "add") return;
    const service = siteRef.current.services.find((item) => item.id === action.id);
    if (!service) return;
    const name = serviceLabel(lang, service);
    if (siteRef.current.cartIds.includes(service.id)) {
      push({
        role: "assistant",
        text: chrome.already(name),
        actions: [{ type: "link", label: chrome.apply, href: "#contact" }],
      });
      return;
    }
    siteRef.current.addService(service.id);
    setChips(chrome.chips);
    rememberFollow(chrome.follow);
    push({
      role: "assistant",
      text: chrome.added(name),
      actions: [
        { type: "link", label: chrome.apply, href: "#contact" },
        { type: "cart", label: chrome.openCart },
      ],
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    const files = attachmentsRef.current.map((item) => item.file);
    const text = draft;
    if (!text.trim() && !files.length) return;
    clearAttachments();
    setPicker(false);
    void send(text, files);
  };

  const openPicker = (input) => {
    if (busyRef.current) return;
    setPicker(false);
    input.current?.click();
  };

  return (
    <div className={`assistant${open ? " is-open" : ""}${fresh ? " is-fresh" : ""}`} data-assistant ref={rootRef}>
      <div className="assistant__panel" id="assistant-panel" hidden={!open}>
        <div className="assistant__card" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
          <header className="assistant__head">
            <span className="assistant__avatar" aria-hidden="true">СЭС</span>
            <div className="assistant__id">
              <h2 id="assistant-title">{chrome.title}</h2>
              <p><span className="assistant__status" aria-hidden="true"></span>{chrome.subtitle}</p>
            </div>
            <button className="btn btn--tiny btn--ghost assistant__close" type="button" onClick={() => setOpen(false)}>
              {chrome.close}
            </button>
          </header>
          <div className="assistant__log" ref={logRef} role="log" aria-relevant="additions">
            {messages.map((message, index) => (
              <article className={`assistant__message assistant__message--${message.role}`} key={`${message.role}-${index}`}>
                {message.files?.length ? (
                  <div className="assistant__files">
                    {message.files.map((file) =>
                      file.kind === "image" && file.preview?.startsWith("data:image/") ? (
                        <img className="assistant__shot" alt={file.name || chrome.imageAlt} src={file.preview} key={file.name} />
                      ) : (
                        <span className="assistant__file" key={file.name}>{file.name || chrome.fileLabel}</span>
                      )
                    )}
                  </div>
                ) : null}
                {message.text ? <div className="assistant__bubble">{message.text}</div> : null}
                {message.role === "assistant" && message.actions?.length ? (
                  <div className="assistant__actions">
                    {message.actions.map((action) => {
                      if (!action || typeof action.type !== "string") return null;
                      if (!["link", "add", "remove", "clear", "cart"].includes(action.type)) return null;
                      if (action.type === "link" && !allowedLink(action.href || "")) return null;
                      if ((action.type === "add" || action.type === "remove") && !site.services.some((item) => item.id === action.id)) return null;
                      const inCart = action.type === "add" && site.cartIds.includes(action.id);
                      const absent = action.type === "remove" && !site.cartIds.includes(action.id);
                      return (
                        <button
                          key={`${action.type}-${action.id || ""}-${action.label}`}
                          type="button"
                          className="btn btn--tiny btn--ghost"
                          disabled={busy || inCart || absent}
                          onClick={() => onAction(action)}
                        >
                          {inCart ? chrome.inCart : absent ? chrome.gone : action.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            ))}
            {typing ? (
              <div className="assistant__typing" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
            ) : null}
          </div>
          <div className="assistant__suggestions" hidden={chips.length === 0}>
            {chips.map((text) => (
              <button key={text} type="button" className="assistant__chip" disabled={busy} onClick={() => void send(text, [])}>
                {text}
              </button>
            ))}
          </div>
          <form className={`assistant__form${dropping ? " is-drop" : ""}`} onSubmit={submit} onDragOver={(event) => {
            if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
            event.preventDefault();
            setDropping(true);
          }} onDragLeave={() => setDropping(false)} onDrop={(event) => {
            if (!event.dataTransfer?.files?.length) return;
            event.preventDefault();
            setDropping(false);
            addFiles(event.dataTransfer.files);
          }}>
            <div className="assistant__pending" hidden={attachments.length === 0}>
              {attachments.map((item) => (
                <div className="assistant__attach" key={item.id}>
                  {item.preview ? <img alt="" src={item.preview} /> : null}
                  <span>{item.name}</span>
                  <button
                    type="button"
                    className="assistant__attach-remove"
                    aria-label={chrome.removeFile(item.name)}
                    disabled={busy}
                    onClick={() => {
                      if (busyRef.current) return;
                      if (item.preview) URL.revokeObjectURL(item.preview);
                      const next = attachmentsRef.current.filter((entry) => entry.id !== item.id);
                      attachmentsRef.current = next;
                      setAttachments(next);
                      if (!next.length) setNote("");
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {picker ? (
              <div className="assistant__menu" id="assistant-attach-menu" role="menu" ref={menuRef}>
                <button type="button" role="menuitem" onClick={() => openPicker(fileRef)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5" />
                  </svg>
                  {chrome.file}
                </button>
                <button type="button" role="menuitem" onClick={() => openPicker(imageRef)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3.5" y="5" width="17" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.4" />
                    <path d="m6 16 4.2-3.4 2.4 2 2-1.6L18 16" />
                  </svg>
                  {chrome.image}
                </button>
              </div>
            ) : null}
            <div className="assistant__composer">
              <div className="assistant__field">
                <button
                  className="assistant__plus"
                  type="button"
                  ref={plusRef}
                  aria-label={chrome.attach}
                  aria-expanded={picker}
                  aria-haspopup="menu"
                  aria-controls="assistant-attach-menu"
                  title={chrome.attachTitle}
                  disabled={busy}
                  onClick={() => setPicker((value) => !value)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <label className="visually-hidden" htmlFor="assistant-input">{chrome.question}</label>
                <textarea
                  id="assistant-input"
                  ref={inputRef}
                  name="message"
                  rows={1}
                  maxLength={500}
                  placeholder={chrome.placeholder}
                  enterKeyHint="send"
                  value={draft}
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                  onPaste={(event) => {
                    const files = [...(event.clipboardData?.files || [])];
                    if (!files.length) return;
                    event.preventDefault();
                    addFiles(files);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return;
                    event.preventDefault();
                    if (draft.trim() || attachmentsRef.current.length) event.currentTarget.form?.requestSubmit();
                  }}
                />
              </div>
              <button className="btn btn--small" type="submit" disabled={busy}>{chrome.send}</button>
            </div>
            <p className="assistant__note" role="status" hidden={!note}>{note}</p>
            <input
              className="visually-hidden"
              type="file"
              ref={fileRef}
              accept=".pdf,.docx,.xlsx,.txt,.csv,.rtf,.odt,.md,.xml,application/pdf,text/plain"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              disabled={busy}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              className="visually-hidden"
              type="file"
              ref={imageRef}
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              disabled={busy}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </form>
        </div>
      </div>

      <button
        className={`assistant-toggle${open ? " is-open" : ""}`}
        type="button"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? chrome.closeLabel : chrome.openLabel}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) setFresh(false);
            else setPicker(false);
            return next;
          });
        }}
      >
        <span className="assistant-toggle__label">{chrome.title}</span>
        <span className="assistant-toggle__icon" aria-hidden="true">
          <svg className="assistant-toggle__chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.2 16.4 4.2 20l4-1.1A7.4 7.4 0 1 0 6.2 16.4z" />
          </svg>
          <svg className="assistant-toggle__x" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </span>
      </button>
    </div>
  );
}
