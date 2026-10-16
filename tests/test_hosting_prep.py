"""Запуск на Railway, копии базы и защита админки. Рабочую базу не изменяет."""

import json
import os
import sqlite3
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import backup_db
import db
import docker_entrypoint
import server

ROOT = Path(__file__).resolve().parents[1]
REAL_DB = ROOT / "data" / "crm.sqlite"
ENV_KEYS = (
    "PORT",
    "SITE_PORT",
    "SITE_HOST",
    "ADMIN_PASSWORD",
    "TRUSTED_PROXY_IPS",
    "TRUSTED_PROXY_CIDRS",
    "RAILWAY_PROJECT_ID",
    "ALLOW_DB_INIT",
    "BACKUP_DIR",
    "SITE_DB_PATH",
    "SITE_ENV_FILE",
    "SITE_DIST_FILE",
)


def snapshot(path):
    conn = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    try:
        return {
            "leads": conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0],
            "invoices": conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0],
            "prices": conn.execute("SELECT COUNT(*) FROM service_prices").fetchone()[0],
            "services": conn.execute("SELECT COUNT(*) FROM services").fetchone()[0],
            "lead_ids": [row[0] for row in conn.execute("SELECT id FROM leads ORDER BY id")],
        }
    finally:
        conn.close()


class QuietHandler(server.Handler):
    def log_message(self, fmt, *args):
        return


class HostingPrepTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.real_before = snapshot(REAL_DB)

    @classmethod
    def tearDownClass(cls):
        after = snapshot(REAL_DB)
        if after != cls.real_before:
            raise AssertionError(f"Рабочая база изменилась: {cls.real_before} -> {after}")

    def setUp(self):
        self.saved_env = {key: os.environ.get(key) for key in ENV_KEYS}
        self.saved_password = (server.PASSWORD_SALT, server.PASSWORD_DIGEST, server.PASSWORD_STATE)
        self.folder = Path(os.environ.get("TEMP", ".")) / "sanexpert-hosting-tests" / self.id().replace(".", "_")
        self.folder.mkdir(parents=True, exist_ok=True)
        self.previous_db = db.DB_PATH

    def tearDown(self):
        db.DB_PATH = self.previous_db
        server.PASSWORD_SALT, server.PASSWORD_DIGEST, server.PASSWORD_STATE = self.saved_password
        server.LEAD_POSTS.clear()
        server.LOGIN_FAILURES.clear()
        server.SESSIONS.clear()
        for key, value in self.saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_port_prefers_railway_and_keeps_site_port(self):
        os.environ["PORT"] = "9090"
        os.environ["SITE_PORT"] = "8080"
        self.assertEqual(server.site_port(), 9090)
        os.environ.pop("PORT", None)
        self.assertEqual(server.site_port(), 8080)

    def test_local_host_stays_on_this_computer(self):
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        os.environ.pop("SITE_HOST", None)
        self.assertEqual(server.site_host(), "127.0.0.1")
        os.environ["SITE_HOST"] = "0.0.0.0"
        self.assertEqual(server.site_host(), "0.0.0.0")

    def test_local_docker_refuses_missing_database(self):
        dist = self.folder / "index.html"
        dist.write_text("site", encoding="utf-8")
        database = self.folder / "data" / "crm.sqlite"
        os.environ["SITE_DIST_FILE"] = str(dist)
        os.environ["SITE_DB_PATH"] = str(database)
        os.environ["SITE_ENV_FILE"] = str(self.folder / "missing.env")
        os.environ["ADMIN_PASSWORD"] = "Railway-Test-9182"
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        os.environ["ALLOW_DB_INIT"] = "0"
        self.assertEqual(docker_entrypoint.check(), 1)
        self.assertFalse(database.exists())

    def test_password_from_environment_allows_start_without_env_file(self):
        dist = self.folder / "index.html"
        dist.write_text("site", encoding="utf-8")
        database = self.folder / "data" / "crm.sqlite"
        os.environ["SITE_DIST_FILE"] = str(dist)
        os.environ["SITE_DB_PATH"] = str(database)
        os.environ["SITE_ENV_FILE"] = str(self.folder / "missing.env")
        os.environ["ADMIN_PASSWORD"] = "Railway-Test-9182"
        os.environ["RAILWAY_PROJECT_ID"] = "audit-project"
        os.environ.pop("ALLOW_DB_INIT", None)
        self.assertEqual(docker_entrypoint.check(), 0)
        self.assertFalse(database.exists())

    def test_empty_volume_is_initialized_without_replacing_an_existing_file(self):
        dist = self.folder / "index.html"
        dist.write_text("site", encoding="utf-8")
        database = self.folder / "data" / "crm.sqlite"
        os.environ["SITE_DIST_FILE"] = str(dist)
        os.environ["SITE_DB_PATH"] = str(database)
        os.environ["SITE_ENV_FILE"] = str(self.folder / "missing.env")
        os.environ["ADMIN_PASSWORD"] = "Railway-Test-9182"
        os.environ["ALLOW_DB_INIT"] = "1"
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        self.assertEqual(docker_entrypoint.check(), 0)
        self.assertFalse(database.exists())
        db.DB_PATH = database
        db.insert_lead({
            "id": "kept-lead",
            "created_at": "2026-10-16T00:00:00+00:00",
            "name": "Тест",
            "contact": "+7 700 000 00 02",
            "object": "Другое",
            "message": "Первый запуск",
            "services": "[]",
            "status": "new",
            "note": "",
        })
        before = database.read_bytes()
        self.assertEqual(docker_entrypoint.check(), 0)
        self.assertEqual(database.read_bytes(), before)
        db.insert_lead({
            "id": "second-lead",
            "created_at": "2026-10-16T00:01:00+00:00",
            "name": "Тест",
            "contact": "+7 700 000 00 03",
            "object": "Другое",
            "message": "Повторный запуск",
            "services": "[]",
            "status": "new",
            "note": "",
        })
        conn = sqlite3.connect(database)
        try:
            rows = conn.execute("SELECT id FROM leads ORDER BY id").fetchall()
        finally:
            conn.close()
        self.assertEqual(rows, [("kept-lead",), ("second-lead",)])

    def test_invalid_database_is_left_in_place(self):
        dist = self.folder / "index.html"
        dist.write_text("site", encoding="utf-8")
        database = self.folder / "data" / "crm.sqlite"
        database.parent.mkdir(parents=True)
        database.write_bytes(b"not a database file")
        os.environ["SITE_DIST_FILE"] = str(dist)
        os.environ["SITE_DB_PATH"] = str(database)
        os.environ["SITE_ENV_FILE"] = str(self.folder / ".env")
        (self.folder / ".env").write_text("ADMIN_PASSWORD=\n", encoding="utf-8")
        os.environ["ALLOW_DB_INIT"] = "1"
        self.assertEqual(docker_entrypoint.check(), 1)
        self.assertEqual(database.read_bytes(), b"not a database file")

    def test_offsite_backup_keeps_the_original(self):
        database = self.folder / "data" / "crm.sqlite"
        offsite = self.folder / "offsite"
        db.DB_PATH = database
        db.insert_lead({
            "id": "backup-lead",
            "created_at": "2026-10-16T00:00:00+00:00",
            "name": "Тест",
            "contact": "+7 700 000 00 04",
            "object": "Другое",
            "message": "Копия",
            "services": "[]",
            "status": "new",
            "note": "",
        })
        before = database.read_bytes()
        os.environ["BACKUP_DIR"] = str(offsite)
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        copied = backup_db.create_backup(source=database)
        self.assertEqual(database.read_bytes(), before)
        self.assertTrue(copied.is_file())
        self.assertNotEqual(copied.resolve(), database.resolve())
        extra = list(offsite.glob("crm-*.sqlite"))
        self.assertEqual(len(extra), 1)
        check = sqlite3.connect(extra[0])
        try:
            row = check.execute("SELECT id FROM leads").fetchone()
        finally:
            check.close()
        self.assertEqual(row[0], "backup-lead")

    def test_admin_crm_and_invoice_stay_closed_without_csrf(self):
        database = self.folder / "crm.sqlite"
        if database.exists():
            database.unlink()
        db.DB_PATH = database
        os.environ["TRUSTED_PROXY_IPS"] = "127.0.0.1"
        os.environ["ADMIN_PASSWORD"] = "Railway-Test-9182"
        server.configure_password()
        server.SESSIONS.clear()
        httpd = server.Server(("127.0.0.1", 0), QuietHandler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            origin = f"http://127.0.0.1:{port}"
            host = f"127.0.0.1:{port}"
            closed, _ = self.exchange(port, "GET", "/api/leads")
            self.assertEqual(closed, 401)
            invoice, _ = self.exchange(port, "POST", "/api/invoices", {}, {"Origin": origin, "Host": host})
            self.assertEqual(invoice, 401)
            rejected, _ = self.exchange(port, "POST", "/api/login", {"password": "Railway-Test-9182"})
            self.assertEqual(rejected, 403)
            status, body, headers = self.exchange(
                port,
                "POST",
                "/api/login",
                {"password": "Railway-Test-9182"},
                {"Origin": origin, "Host": host},
                include_headers=True,
            )
            self.assertEqual(status, 200)
            self.assertTrue(body.get("csrfToken"))
            cookie = headers.get("Set-Cookie", "")
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=Strict", cookie)
            lead_status, lead_body = self.exchange(
                port,
                "POST",
                "/api/leads",
                {
                    "id": "admin-lead",
                    "name": "Тест",
                    "contact": "+7 700 000 00 05",
                    "object": "Другое",
                    "message": "Заявка для CRM",
                    "services": ["Санитарный аудит объекта"],
                },
                {"Origin": origin, "Host": host},
            )
            self.assertEqual(lead_status, 201)
            self.assertEqual(lead_body.get("id"), "admin-lead")
            forged, _ = self.exchange(
                port,
                "PATCH",
                "/api/leads/admin-lead",
                {"status": "work"},
                {"Origin": origin, "Host": host, "Cookie": cookie.split(";", 1)[0]},
            )
            self.assertEqual(forged, 403)
            saved, _ = self.exchange(
                port,
                "PATCH",
                "/api/leads/admin-lead",
                {"status": "work"},
                {
                    "Origin": origin,
                    "Host": host,
                    "Cookie": cookie.split(";", 1)[0],
                    "X-CSRF-Token": body["csrfToken"],
                },
            )
            self.assertEqual(saved, 200)
            conn = sqlite3.connect(database)
            try:
                row = conn.execute("SELECT status FROM leads WHERE id = 'admin-lead'").fetchone()
            finally:
                conn.close()
            self.assertEqual(row[0], "work")
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)

    def exchange(self, port, method, path, payload=None, headers=None, include_headers=False):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}{path}",
            data=data,
            headers={"Content-Type": "application/json", **(headers or {})},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
                if include_headers:
                    return response.status, body, response.headers
                return response.status, body
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            error.close()
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = {"raw": raw}
            if include_headers:
                return error.code, body, error.headers
            return error.code, body


if __name__ == "__main__":
    unittest.main()
