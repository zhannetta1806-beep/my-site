"""Заявки и HTTPS за доверенным прокси. Рабочую базу не изменяет."""

import json
import os
import sqlite3
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import db
import server

ROOT = Path(__file__).resolve().parents[1]
REAL_DB = ROOT / "data" / "crm.sqlite"


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


class OrderHttpsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.real_before = snapshot(REAL_DB)

    @classmethod
    def tearDownClass(cls):
        cls.assert_real = None
        after = snapshot(REAL_DB)
        if after != cls.real_before:
            raise AssertionError(f"Рабочая база изменилась: {cls.real_before} -> {after}")

    def setUp(self):
        self.tmp = Path(self.id().replace(".", "_"))
        folder = Path(os.environ.get("TEMP", ".")) / "sanexpert-order-tests" / self.tmp.name
        folder.mkdir(parents=True, exist_ok=True)
        self.db_path = folder / "crm.sqlite"
        if self.db_path.exists():
            self.db_path.unlink()
        self.previous_db = db.DB_PATH
        self.previous_proxy = os.environ.get("TRUSTED_PROXY_IPS")
        self.previous_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
        db.DB_PATH = self.db_path
        os.environ["TRUSTED_PROXY_IPS"] = ""
        os.environ.pop("RAILWAY_PUBLIC_DOMAIN", None)
        server.LEAD_POSTS.clear()
        self.httpd = server.Server(("127.0.0.1", 0), QuietHandler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        db.DB_PATH = self.previous_db
        if self.previous_proxy is None:
            os.environ.pop("TRUSTED_PROXY_IPS", None)
        else:
            os.environ["TRUSTED_PROXY_IPS"] = self.previous_proxy
        if self.previous_domain is None:
            os.environ.pop("RAILWAY_PUBLIC_DOMAIN", None)
        else:
            os.environ["RAILWAY_PUBLIC_DOMAIN"] = self.previous_domain
        server.LEAD_POSTS.clear()

    def origin(self):
        return f"http://127.0.0.1:{self.port}"

    def post(self, payload, headers=None):
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/leads",
            data=data,
            headers={"Content-Type": "application/json", **(headers or {})},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
                return response.status, body
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            error.close()
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = {"raw": raw}
            return error.code, body

    def lead(self, lead_id="order-test-1", name="Тест Заказа"):
        return {
            "id": lead_id,
            "createdAt": "2026-10-13T18:00:00+00:00",
            "name": name,
            "contact": "+7 700 000 00 01",
            "object": "Заказ услуги",
            "message": "Заказ с сайта.",
            "services": ["Санитарный аудит объекта"],
            "status": "done",
            "note": "нельзя записать",
        }

    def rows(self):
        if not self.db_path.exists():
            return []
        conn = sqlite3.connect(self.db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'"
            ).fetchone()
            if not exists:
                return []
            return conn.execute(
                "SELECT id, name, status, note FROM leads ORDER BY id"
            ).fetchall()
        finally:
            conn.close()

    def test_direct_http_saves_once_and_repeat_does_not_change_row(self):
        headers = {"Origin": self.origin(), "Host": f"127.0.0.1:{self.port}"}
        status, body = self.post(self.lead(), headers)
        self.assertEqual(status, 201)
        self.assertEqual(body.get("id"), "order-test-1")
        again, _ = self.post(self.lead(name="Другое имя"), headers)
        self.assertEqual(again, 201)
        self.assertEqual(self.rows(), [("order-test-1", "Тест Заказа", "new", "")])

    def test_missing_origin_is_rejected_and_stores_nothing(self):
        status, _ = self.post(self.lead("order-test-2"))
        self.assertEqual(status, 403)
        self.assertEqual(self.rows(), [])

    def test_visitor_https_headers_are_ignored(self):
        os.environ["TRUSTED_PROXY_IPS"] = "203.0.113.10"
        headers = {
            "Origin": "https://audit.example",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "audit.example",
        }
        status, _ = self.post(self.lead("order-test-3"), headers)
        self.assertEqual(status, 403)
        self.assertEqual(self.rows(), [])

    def test_trusted_proxy_accepts_https_public_host(self):
        os.environ["TRUSTED_PROXY_IPS"] = "127.0.0.1"
        headers = {
            "Origin": "https://audit.example",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "audit.example:443",
        }
        status, body = self.post(self.lead("order-test-4"), headers)
        self.assertEqual(status, 201)
        self.assertEqual(body.get("id"), "order-test-4")
        self.assertEqual(len(self.rows()), 1)

    def test_trusted_proxy_rejects_header_lists(self):
        os.environ["TRUSTED_PROXY_IPS"] = "127.0.0.1"
        listed = {
            "Origin": "https://audit.example",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https, http",
            "X-Forwarded-Host": "audit.example",
        }
        status, _ = self.post(self.lead("order-test-5"), listed)
        self.assertEqual(status, 403)
        mixed_host = {
            "Origin": "https://audit.example",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "evil.example, audit.example",
        }
        status, _ = self.post(self.lead("order-test-6"), mixed_host)
        self.assertEqual(status, 403)
        self.assertEqual(self.rows(), [])

    def test_local_dev_origin_still_allowed_without_trusting_proto(self):
        headers = {
            "Origin": "http://localhost:5173",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "evil.example",
        }
        status, _ = self.post(self.lead("order-test-7"), headers)
        self.assertEqual(status, 201)
        spoofed = {
            "Origin": "https://localhost:5173",
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "localhost:5173",
        }
        status, _ = self.post(self.lead("order-test-8"), spoofed)
        self.assertEqual(status, 403)

    def test_forged_forwarded_for_does_not_replace_the_direct_address(self):
        os.environ["TRUSTED_PROXY_IPS"] = ""
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        headers = {
            "Origin": self.origin(),
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-For": "198.51.100.10",
            "X-Forwarded-Proto": "https",
        }
        status, _ = self.post(self.lead("order-test-forge"), headers)
        self.assertEqual(status, 201)
        self.assertIn("127.0.0.1", server.LEAD_POSTS)
        self.assertNotIn("198.51.100.10", server.LEAD_POSTS)

    def test_trusted_proxy_limits_each_forwarded_visitor(self):
        os.environ["TRUSTED_PROXY_IPS"] = "127.0.0.1"
        first = {
            "Origin": self.origin(),
            "Host": f"127.0.0.1:{self.port}",
            "X-Forwarded-For": "198.51.100.10",
        }
        for index in range(20):
            status, _ = self.post(self.lead(f"limit{index}"), first)
            self.assertEqual(status, 201, index)
        blocked, _ = self.post(self.lead("limitblocked"), first)
        self.assertEqual(blocked, 429)
        second = {**first, "X-Forwarded-For": "198.51.100.11"}
        allowed, body = self.post(self.lead("limitother"), second)
        self.assertEqual(allowed, 201)
        self.assertEqual(body.get("id"), "limitother")

    def test_private_ranges_are_not_trusted_without_explicit_proxy(self):
        os.environ["RAILWAY_PROJECT_ID"] = "audit-project"
        os.environ["RAILWAY_PUBLIC_DOMAIN"] = "audit.example"
        os.environ["TRUSTED_PROXY_IPS"] = ""
        os.environ.pop("TRUSTED_PROXY_CIDRS", None)
        try:
            for address in ("10.9.8.7", "100.64.8.8", "172.16.0.4", "192.168.1.9", "203.0.113.9"):
                self.assertFalse(server.peer_is_trusted(address))
                handler = QuietHandler.__new__(QuietHandler)
                handler.client_address = (address, 9)
                handler.headers = {
                    "Host": "internal.example",
                    "X-Forwarded-Proto": "https",
                    "X-Forwarded-Host": "audit.example",
                    "X-Forwarded-For": "198.51.100.20",
                    "X-Real-IP": "198.51.100.20",
                }
                self.assertFalse(handler.request_is_https())
                self.assertEqual(handler.client_ip(), address)
                self.assertNotIn("Secure", handler.session_cookie("token"))
            public = QuietHandler.__new__(QuietHandler)
            public.client_address = ("100.64.8.8", 9)
            public.headers = {
                "Host": "audit.example",
                "X-Forwarded-Proto": "http",
                "X-Forwarded-Host": "evil.example",
                "X-Real-IP": "198.51.100.20",
            }
            self.assertTrue(public.request_is_https())
            self.assertFalse(server.peer_is_trusted("100.64.8.8"))
            self.assertEqual(public.client_ip(), "100.64.8.8")
            cookie = public.session_cookie("token")
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=Strict", cookie)
            self.assertIn("Secure", cookie)
        finally:
            os.environ.pop("RAILWAY_PROJECT_ID", None)
            os.environ.pop("RAILWAY_PUBLIC_DOMAIN", None)

    def test_secure_cookie_follows_trusted_https_only(self):
        handler = QuietHandler.__new__(QuietHandler)
        handler.client_address = ("127.0.0.1", 9)
        handler.headers = {"X-Forwarded-Proto": "https"}
        os.environ["TRUSTED_PROXY_IPS"] = ""
        self.assertNotIn("Secure", handler.session_cookie("token"))
        os.environ["TRUSTED_PROXY_IPS"] = "127.0.0.1"
        self.assertIn("Secure", handler.session_cookie("token"))
        handler.headers = {"X-Forwarded-Proto": "https, http"}
        self.assertNotIn("Secure", handler.session_cookie("token"))
        handler.client_address = ("203.0.113.8", 9)
        handler.headers = {"X-Forwarded-Proto": "https"}
        self.assertNotIn("Secure", handler.session_cookie("token"))


if __name__ == "__main__":
    unittest.main()
