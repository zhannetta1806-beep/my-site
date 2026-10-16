let csrfToken = "";
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function csrfHeader(method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  if (!csrfToken || verb === "GET" || verb === "HEAD") return {};
  return { "X-CSRF-Token": csrfToken };
}

export async function api(url, options = {}) {
  const method = options.method || "GET";
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeader(method),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 && onUnauthorized) {
    csrfToken = "";
    onUnauthorized();
  }
  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    const error = new Error(payload?.error ? String(payload.error) : String(response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function refreshSession() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  if (!response.ok) {
    csrfToken = "";
    return false;
  }
  const data = await response.json();
  csrfToken = data?.authenticated ? String(data.csrfToken || "") : "";
  return Boolean(csrfToken);
}

export async function login(password) {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok || !data.csrfToken) {
    csrfToken = "";
    const fallback = response.status >= 500
      ? "Сервер сайта не запущен. В папке сайта выполните python server.py."
      : "Не удалось войти.";
    const error = new Error(data.error || fallback);
    error.status = response.status;
    throw error;
  }
  csrfToken = String(data.csrfToken);
  return true;
}

export async function logout() {
  const current = csrfToken;
  const response = await fetch("/api/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(current ? { "X-CSRF-Token": current } : {}),
    },
  });
  if (!response.ok) {
    const error = new Error("logout");
    error.status = response.status;
    throw error;
  }
  csrfToken = "";
}
