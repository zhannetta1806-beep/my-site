import { useEffect, useState } from "react";
import { Header } from "./Header";
import { AdminLogoutContext } from "../lib/adminLogout";
import { login, logout, refreshSession, setUnauthorizedHandler } from "../lib/auth";
import { usePageMeta } from "../lib/usePageMeta";

export function AdminGate({ kind, title, children }) {
  const [phase, setPhase] = useState("check");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  usePageMeta(phase === "in" ? title : "Вход", "noindex");

  useEffect(() => {
    let ignore = false;
    refreshSession().then((ok) => {
      if (!ignore) setPhase(ok ? "in" : "out");
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setPhase("out"));
    return () => setUnauthorizedHandler(null);
  }, []);

  const onLogin = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const entered = new FormData(event.currentTarget).get("password");
      await login(String(entered || ""));
      setPassword("");
      setPhase("in");
    } catch (requestError) {
      setError(requestError.message || "Не удалось войти.");
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setError("");
    try {
      await logout();
      setPhase("out");
    } catch {
      setError("Не удалось выйти. Попробуйте ещё раз.");
    }
  };

  if (phase === "check") {
    return (
      <>
        <Header kind={kind} />
        <main className="section admin" id="main">
          <div className="wrap">
            <p className="request__status" role="status">Проверка входа…</p>
          </div>
        </main>
      </>
    );
  }

  if (phase !== "in") {
    return (
      <>
        <Header kind={kind} />
        <main className="section admin" id="main">
          <div className="wrap">
            <header className="section__head">
              <h1>Вход</h1>
              <p className="section__lead">Этот раздел открывается только после входа администратора.</p>
            </header>
            <form className="login-card" onSubmit={onLogin}>
              <label className="field">
                <span>Пароль</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <p className="request__status" role="alert" hidden={!error}>{error}</p>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Проверка…" : "Войти"}</button>
            </form>
          </div>
        </main>
      </>
    );
  }

  return (
    <AdminLogoutContext.Provider value={onLogout}>
      {error ? <p className="request__status wrap" role="alert">{error}</p> : null}
      {children}
    </AdminLogoutContext.Provider>
  );
}
