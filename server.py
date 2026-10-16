"""Сайт и CRM. Услуги и заявки пишутся в SQLite: data/crm.sqlite."""

import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import signal
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import db

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
SESSION_COOKIE = "sanexpert_session"
SESSION_IDLE = 12 * 60 * 60
LOGIN_WINDOW = 15 * 60
LOGIN_LIMIT = 5
LEAD_WINDOW = 10 * 60
LEAD_LIMIT = 20
DEV_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://[::1]:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://[::1]:4173",
}
PASSWORD_SALT = b""
PASSWORD_DIGEST = b""
PASSWORD_STATE = "unset"
SESSIONS = {}
SESSION_LOCK = threading.Lock()
LIMIT_LOCK = threading.Lock()
LOGIN_FAILURES = {}
LEAD_POSTS = {}


RAILWAY_KEYS = (
    "RAILWAY_PROJECT_ID",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_SERVICE_ID",
)


def railway_runtime():
    return any(os.environ.get(key, "").strip() for key in RAILWAY_KEYS)


def site_port():
    """PORT задаёт Railway. Локальный запуск и Compose используют SITE_PORT, затем 8080."""
    for key in ("PORT", "SITE_PORT"):
        raw = os.environ.get(key, "").strip()
        if raw.isdigit() and 1 <= int(raw) <= 65535:
            return int(raw)
    return 8080


def site_host():
    """Локальный запуск слушает только этот компьютер. Контейнер и Railway слушают 0.0.0.0."""
    if railway_runtime() or os.environ.get("SITE_HOST", "").strip() == "0.0.0.0":
        return "0.0.0.0"
    return "127.0.0.1"


def password_is_strong(value):
    if not isinstance(value, str):
        return False
    if len(value) < 12 or len(value) > 128:
        return False
    letters = any(char.isalpha() for char in value)
    digits = any(char.isdigit() for char in value)
    other = any(not char.isalnum() for char in value)
    return letters and digits and other


def load_local_env():
    """Читает локальный .env. Уже заданные переменные окружения не перекрывает и ничего не печатает."""
    env_path = (ROOT / ".env").resolve()
    allowed = {
        "ADMIN_PASSWORD",
        "SITE_HOST",
        "SITE_PORT",
        "TRUSTED_PROXY_IPS",
        "TRUSTED_PROXY_CIDRS",
        "ALLOW_DB_INIT",
        "BACKUP_DIR",
    }
    try:
        if env_path.parent != ROOT or not env_path.is_file() or env_path.stat().st_size > 16384:
            return
        lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return
    for line in lines:
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if text.startswith("export "):
            text = text[7:].strip()
        if "=" not in text:
            continue
        key, value = text.split("=", 1)
        key = key.strip()
        if key not in allowed or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ[key] = value


def configure_password():
    global PASSWORD_SALT, PASSWORD_DIGEST, PASSWORD_STATE
    raw = os.environ.get("ADMIN_PASSWORD", "")
    PASSWORD_SALT = b""
    PASSWORD_DIGEST = b""
    if raw == "":
        PASSWORD_STATE = "unset"
        return
    if not password_is_strong(raw):
        PASSWORD_STATE = "weak"
        return
    try:
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(raw.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    except Exception:
        PASSWORD_STATE = "weak"
        return
    PASSWORD_SALT = salt
    PASSWORD_DIGEST = digest
    PASSWORD_STATE = "ready"


def password_matches(candidate):
    material = candidate if isinstance(candidate, str) and 0 < len(candidate) <= 128 else "invalid-password"
    salt = PASSWORD_SALT or b"\x00" * 16
    try:
        check = hashlib.scrypt(material.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    except Exception:
        return False
    if PASSWORD_STATE != "ready" or not isinstance(candidate, str):
        return False
    return hmac.compare_digest(check, PASSWORD_DIGEST)


def same_secret(left, right):
    if not isinstance(left, str) or not isinstance(right, str) or len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def trusted_proxy_ips():
    return {item.strip() for item in os.environ.get("TRUSTED_PROXY_IPS", "").split(",") if item.strip()}


def parse_ip(value):
    text = str(value or "").strip()
    if text.startswith("[") and "]" in text:
        text = text[1:text.index("]")]
    try:
        parsed = ipaddress.ip_address(text)
    except ValueError:
        return None
    mapped = getattr(parsed, "ipv4_mapped", None)
    return mapped or parsed


def trusted_proxy_networks():
    """Только сети из TRUSTED_PROXY_CIDRS. Широкие частные сети сами не доверяются."""
    raw = os.environ.get("TRUSTED_PROXY_CIDRS", "").strip()
    networks = []
    for item in raw.split(","):
        text = item.strip()
        if not text:
            continue
        try:
            networks.append(ipaddress.ip_network(text, strict=False))
        except ValueError:
            continue
    return networks


def public_site_host():
    """Публичное имя сайта из RAILWAY_PUBLIC_DOMAIN. Запрос этого значения не задаёт."""
    raw = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if not raw or any(char in raw for char in " /,@\\"):
        return ""
    host = canonical_netloc(raw, "https")
    if not host or ":" in host or host.startswith("."):
        return ""
    return host


def peer_is_trusted(ip):
    parsed = parse_ip(ip)
    if parsed is None:
        return False
    for item in trusted_proxy_ips():
        other = parse_ip(item)
        if item == ip or (other is not None and other == parsed):
            return True
    return any(parsed in network for network in trusted_proxy_networks())


def visitor_from_forwarded(value):
    """Правый адрес добавлен ближайшим прокси. Список с мусором не принимается."""
    parts = [item.strip() for item in str(value or "").split(",") if item.strip()]
    if not parts:
        return ""
    parsed = [parse_ip(item) for item in parts]
    if any(item is None for item in parsed):
        return ""
    return str(parsed[-1])


def single_forwarded_ip(value):
    """Один адрес. Список и пробелы не принимаются: их мог прислать не прокси."""
    text = str(value or "").strip()
    if not text or "," in text or any(char.isspace() for char in text):
        return ""
    parsed = parse_ip(text)
    return str(parsed) if parsed is not None else ""


def forwarded_proto(value):
    """Одно значение http или https. Список через запятую не принимается: его мог дописать посетитель."""
    text = str(value or "").strip().lower()
    if text in {"http", "https"}:
        return text
    return ""


def forwarded_host(value):
    """Один адрес вида host или host:port. Без пользователя, пути и нескольких значений."""
    text = str(value or "").strip()
    if not text or len(text) > 255 or any(char.isspace() for char in text) or "," in text:
        return ""
    if any(char in text for char in "@/\\"):
        return ""
    parsed = urlparse("//" + text)
    hostname = parsed.hostname
    if not hostname or parsed.username or parsed.password or parsed.path not in {"", "/"}:
        return ""
    try:
        port = parsed.port
    except ValueError:
        return ""
    if port is not None and not 1 <= port <= 65535:
        return ""
    if ":" in hostname:
        if not re.fullmatch(r"[0-9A-Fa-f:]+", hostname):
            return ""
    else:
        if ".." in hostname or hostname.startswith(".") or hostname.endswith("."):
            return ""
        for label in hostname.split("."):
            if not label or len(label) > 63 or label.startswith("-") or label.endswith("-"):
                return ""
            if not re.fullmatch(r"[A-Za-z0-9-]+", label):
                return ""
    return text


def canonical_netloc(netloc, scheme):
    text = str(netloc or "").strip()
    if not text or any(char.isspace() for char in text):
        return ""
    parsed = urlparse("//" + text)
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return ""
    try:
        port = parsed.port
    except ValueError:
        return ""
    host = f"[{hostname}]" if ":" in hostname else hostname
    if port is None or (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        return host
    return f"{host}:{port}"


def prune(bucket, ip, window):
    now = time.monotonic()
    stamps = [item for item in bucket.get(ip, []) if now - item < window]
    if stamps:
        bucket[ip] = stamps
    else:
        bucket.pop(ip, None)
    return stamps


def limited(bucket, ip, window, maximum):
    with LIMIT_LOCK:
        return len(prune(bucket, ip, window)) >= maximum


def mark(bucket, ip, window):
    with LIMIT_LOCK:
        stamps = prune(bucket, ip, window)
        stamps.append(time.monotonic())
        bucket[ip] = stamps


def clear_marks(bucket, ip):
    with LIMIT_LOCK:
        bucket.pop(ip, None)


def create_session():
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    with SESSION_LOCK:
        SESSIONS[token] = {"csrf": csrf, "seen": time.monotonic()}
    return token, csrf


def current_csrf(token):
    if not token:
        return ""
    now = time.monotonic()
    with SESSION_LOCK:
        item = SESSIONS.get(token)
        if not item:
            return ""
        if now - item["seen"] > SESSION_IDLE:
            SESSIONS.pop(token, None)
            return ""
        item["seen"] = now
        return item["csrf"]


def drop_session(token):
    if not token:
        return
    with SESSION_LOCK:
        SESSIONS.pop(token, None)


def clean(value, limit):
    return " ".join(str(value or "").split())[:limit]


def parse_lead(payload, existing_id=""):
    if not isinstance(payload, dict):
        return None
    name = clean(payload.get("name"), 120)
    contact = clean(payload.get("contact"), 160)
    message = str(payload.get("message") or "").strip()[:2000]
    if not name or not contact or not message:
        return None
    lead_id = clean(payload.get("id") or existing_id, 80)
    if not lead_id.replace("-", "").isalnum():
        return None
    created = clean(payload.get("createdAt") or payload.get("created_at"), 40)
    if not created:
        created = datetime.now(timezone.utc).isoformat()
    services = payload.get("services") if isinstance(payload.get("services"), list) else []
    status = payload.get("status") if payload.get("status") in db.STATUSES else "new"
    return {
        "id": lead_id,
        "created_at": created,
        "name": name,
        "contact": contact,
        "object": clean(payload.get("object"), 160) or "Другое",
        "message": message,
        "services": json.dumps([clean(item, 160) for item in services if clean(item, 160)][:12], ensure_ascii=False),
        "status": status,
        "note": str(payload.get("note") or "").strip()[:1000],
    }


def money_text(value):
    raw = db.text(value, 40).replace(" ", "").replace("\u00a0", "")
    if not raw:
        return ""
    normalized = raw.replace(",", ".")
    if not re.fullmatch(r"\d+(\.\d+)?", normalized):
        return None
    whole, _, fraction = normalized.partition(".")
    if len(whole) > 12:
        return None
    kept = fraction[:2]
    if len(kept) < 2 and fraction[2:3] >= "5":
        return None
    if fraction[2:3] >= "5":
        scale = 10 ** (2 - len(kept)) if kept else 1
        amount = int(whole) * 100 + int(kept or "0") * scale + 1
        whole, kept = divmod(amount, 100)
        kept = f"{kept:02d}"
    else:
        kept = (kept or "0").ljust(2, "0")[:2]
    if kept == "00":
        return str(int(whole))
    return f"{int(whole)},{kept}"


def rate_text(value):
    parsed = money_text(value)
    if parsed is None or parsed == "":
        return None
    number = float(parsed.replace(",", "."))
    if number < 0 or number > 100:
        return None
    return parsed


def clean_requisites(payload):
    if not isinstance(payload, dict):
        return None
    tax = db.text(payload.get("taxId"), 20).replace(" ", "")
    if tax and not (len(tax) == 12 and tax.isdigit()):
        return None
    status = payload.get("vatStatus") if payload.get("vatStatus") in {"none", "vat"} else "none"
    rate = ""
    if status == "vat":
        rate = rate_text(payload.get("vatRate"))
        if rate is None:
            return None
    return {
        "name": db.text(payload.get("name"), 180),
        "tax_id": tax,
        "address": db.text(payload.get("address"), 240),
        "bank": db.text(payload.get("bank"), 160),
        "iik": db.text(payload.get("iik"), 34),
        "bik": db.text(payload.get("bik"), 20),
        "kbe": db.text(payload.get("kbe"), 10),
        "phone": db.text(payload.get("phone"), 40),
        "email": db.text(payload.get("email"), 80),
        "vat_status": status,
        "vat_rate": rate,
        "signatory_name": db.text(payload.get("signatoryName"), 160),
        "signatory_title": db.text(payload.get("signatoryTitle"), 160),
    }


def raw_text(value):
    return str(value or "").replace("\x00", "").replace("\r\n", "\n").strip()


def bounded_text(value, limit):
    text = raw_text(value)
    if len(text) > limit:
        return None
    return text


def optional_tax(value):
    text = raw_text(value).replace(" ", "")
    if len(text) > 20:
        return None
    if text and not (len(text) == 12 and text.isdigit()):
        return None
    return text


def optional_phone(value):
    text = bounded_text(value, 40)
    if text is None or not text:
        return text
    if not re.fullmatch(r"[+\d][\d\s().-]*", text):
        return None
    digits = re.sub(r"\D", "", text)
    if not 10 <= len(digits) <= 15:
        return None
    return text


def optional_email(value):
    text = bounded_text(value, 80)
    if text is None or not text:
        return text
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", text):
        return None
    return text


def optional_iik(value):
    text = raw_text(value).replace(" ", "").upper()
    if not text:
        return ""
    if not re.fullmatch(r"KZ[A-Z0-9]{18}", text):
        return None
    return text


def optional_bik(value):
    text = raw_text(value).replace(" ", "").upper()
    if len(text) > 20:
        return None
    if not text:
        return ""
    if not re.fullmatch(r"[A-Z0-9]{8}([A-Z0-9]{3})?", text):
        return None
    return text


def optional_kbe(value):
    text = raw_text(value).replace(" ", "")
    if len(text) > 10:
        return None
    if not text:
        return ""
    if not re.fullmatch(r"\d{2}", text):
        return None
    return text


def valid_iso_date(value):
    text = bounded_text(value, 10)
    if not text or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return None
    try:
        parsed = datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text if parsed.strftime("%Y-%m-%d") == text else None


def clean_snapshot(payload):
    if not isinstance(payload, dict):
        return None
    lead_id = payload.get("leadId")
    source = payload.get("snapshot")
    if not isinstance(lead_id, str) or "/" in lead_id or not lead_id.replace("-", "").isalnum():
        return None
    if not isinstance(source, dict):
        return None
    number = bounded_text(source.get("number"), 40)
    issued_on = valid_iso_date(source.get("date"))
    if not number or issued_on is None or not re.fullmatch(r"[\w][\w\s./\-]*", number):
        return None
    executor = bounded_text(source.get("executorName"), 180)
    customer = bounded_text(source.get("customerName"), 180)
    if not executor or not customer:
        return None
    lines = source.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 30:
        return None
    cleaned_lines = []
    for line in lines:
        if not isinstance(line, dict):
            return None
        title = bounded_text(line.get("title"), 180)
        quantity = bounded_text(line.get("quantity"), 40)
        price = bounded_text(line.get("price"), 40)
        amount = line.get("amountTiyn")
        if not title or quantity is None or price is None or not isinstance(amount, int) or amount < 0:
            return None
        cleaned_lines.append({
            "title": title,
            "quantity": quantity,
            "price": price,
            "amountTiyn": amount,
        })
    total = source.get("totalTiyn")
    net = source.get("netTiyn")
    vat = source.get("vatTiyn")
    if not all(isinstance(item, int) and item >= 0 for item in (total, net, vat)):
        return None
    tax = optional_tax(source.get("executorTaxId"))
    customer_tax = optional_tax(source.get("customerTaxId"))
    address = bounded_text(source.get("address"), 240)
    actual_address = bounded_text(source.get("actualAddress"), 240)
    bank = bounded_text(source.get("bank"), 160)
    phone = optional_phone(source.get("phone"))
    email = optional_email(source.get("email"))
    iik = optional_iik(source.get("iik"))
    bik = optional_bik(source.get("bik"))
    kbe = optional_kbe(source.get("kbe"))
    customer_contact = bounded_text(source.get("customerContact"), 160)
    customer_address = bounded_text(source.get("customerAddress"), 240)
    customer_phone = optional_phone(source.get("customerPhone"))
    customer_email = optional_email(source.get("customerEmail"))
    customer_iik = optional_iik(source.get("customerIik"))
    customer_bik = optional_bik(source.get("customerBik"))
    customer_bank = bounded_text(source.get("customerBank"), 160)
    customer_kbe = optional_kbe(source.get("customerKbe"))
    purpose = bounded_text(source.get("purpose"), 500)
    signatory_name = bounded_text(source.get("signatoryName"), 160)
    signatory_title = bounded_text(source.get("signatoryTitle"), 160)
    party_fields = (
        tax, customer_tax, address, actual_address, bank, phone, email, iik, bik, kbe,
        customer_contact, customer_address, customer_phone, customer_email, customer_iik,
        customer_bik, customer_bank, customer_kbe, purpose, signatory_name, signatory_title,
    )
    if any(item is None for item in party_fields):
        return None
    stamp = source.get("stampUsed") is True
    stamp_note = bounded_text(source.get("stampNote"), 300) if stamp else ""
    if stamp_note is None:
        return None
    vat_payer = source.get("vatPayer") is True
    vat_rate = bounded_text(source.get("vatRate"), 20)
    if vat_rate is None:
        return None
    if vat_payer:
        if not re.fullmatch(r"\d{1,3}(,\d{1,2})?", vat_rate):
            return None
        if float(vat_rate.replace(",", ".")) > 100:
            return None
    else:
        vat_rate = ""
    snapshot = {
        "number": number,
        "date": issued_on,
        "executorName": executor,
        "executorTaxId": tax,
        "address": address,
        "actualAddress": actual_address,
        "iik": iik,
        "bik": bik,
        "bank": bank,
        "kbe": kbe,
        "phone": phone,
        "email": email,
        "customerName": customer,
        "customerContact": customer_contact,
        "customerTaxId": customer_tax,
        "customerAddress": customer_address,
        "customerPhone": customer_phone,
        "customerEmail": customer_email,
        "customerIik": customer_iik,
        "customerBik": customer_bik,
        "customerBank": customer_bank,
        "customerKbe": customer_kbe,
        "purpose": purpose,
        "signatoryName": signatory_name,
        "signatoryTitle": signatory_title,
        "stampUsed": stamp,
        "stampNote": stamp_note,
        "vatPayer": vat_payer,
        "vatRate": vat_rate,
        "lines": cleaned_lines,
        "netTiyn": net,
        "vatTiyn": vat,
        "totalTiyn": total,
    }
    return {"leadId": lead_id, "number": number, "issuedOn": issued_on, "totalTiyn": total, "snapshot": snapshot}


class Server(ThreadingHTTPServer):
    allow_reuse_address = False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def peer_ip(self):
        return self.client_address[0]

    def client_ip(self):
        """Адрес для лимита. Чужие X-Real-IP и X-Forwarded-For не подменяют прямое соединение."""
        peer = self.peer_ip()
        if not peer_is_trusted(peer):
            return peer
        return (
            single_forwarded_ip(self.headers.get("X-Real-IP", ""))
            or visitor_from_forwarded(self.headers.get("X-Forwarded-For", ""))
            or peer
        )

    def request_is_https(self):
        """HTTPS от явного прокси либо для публичного имени Railway.

        Совпадение Host и Origin не делает отправителя доверенным прокси:
        X-Forwarded-Proto при этом не читается.
        """
        if peer_is_trusted(self.peer_ip()):
            return forwarded_proto(self.headers.get("X-Forwarded-Proto", "")) == "https"
        expected = public_site_host()
        if not expected:
            return False
        return canonical_netloc(self.headers.get("Host", ""), "https") == expected

    def browser_host(self):
        """Адрес страницы в браузере.

        X-Forwarded-Host учитывается только у TCP-соединения доверенного прокси.
        От прямого посетителя и от локального процесса вне этого списка заголовок игнорируется.
        Прокси должен заменять заголовок своим значением, а не дописывать значение посетителя.
        """
        host = self.headers.get("Host", "")
        if not peer_is_trusted(self.peer_ip()):
            return host
        return forwarded_host(self.headers.get("X-Forwarded-Host", "")) or host

    def origin_allowed(self):
        origin = self.headers.get("Origin", "")
        if not origin or origin == "null":
            return False
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        scheme = "https" if self.request_is_https() else "http"
        origin_host = canonical_netloc(parsed.netloc, scheme)
        site_host = canonical_netloc(self.browser_host(), scheme)
        if parsed.scheme == scheme and origin_host and origin_host == site_host:
            return True
        return self.peer_ip() in {"127.0.0.1", "::1"} and origin in DEV_ORIGINS

    def read_cookie(self):
        header = self.headers.get("Cookie", "")
        prefix = SESSION_COOKIE + "="
        for part in header.split(";"):
            item = part.strip()
            if item.startswith(prefix):
                return item[len(prefix):]
        return ""

    def session_cookie(self, token):
        parts = [
            f"{SESSION_COOKIE}={token}",
            "HttpOnly",
            "SameSite=Strict",
            "Path=/",
            f"Max-Age={SESSION_IDLE}",
        ]
        if self.request_is_https():
            parts.append("Secure")
        return "; ".join(parts)

    def clear_cookie(self):
        parts = [
            f"{SESSION_COOKIE}=",
            "HttpOnly",
            "SameSite=Strict",
            "Path=/",
            "Max-Age=0",
        ]
        if self.request_is_https():
            parts.append("Secure")
        return "; ".join(parts)

    def send_json(self, code, payload, set_cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if set_cookie:
            self.send_header("Set-Cookie", set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 120000:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            return None

    def csrf_matches(self, csrf):
        return same_secret(csrf, self.headers.get("X-CSRF-Token", ""))

    def require_admin(self, mutating):
        if PASSWORD_STATE != "ready":
            self.send_json(403, {"error": "Вход администратора не настроен."})
            return False
        if mutating and not self.origin_allowed():
            self.send_json(403, {"error": "Запрос отклонён."})
            return False
        token = self.read_cookie()
        csrf = current_csrf(token)
        if not csrf:
            self.send_json(401, {"error": "Нужно войти."})
            return False
        if mutating and not self.csrf_matches(csrf):
            self.send_json(403, {"error": "Запрос отклонён."})
            return False
        self.session_token = token
        return True

    def record_id(self, prefix):
        path = urlparse(self.path).path
        if not path.startswith(prefix):
            return ""
        record_id = path[len(prefix):]
        if not record_id or "/" in record_id or not record_id.replace("-", "").isalnum():
            return ""
        return record_id

    def lead_id(self):
        return self.record_id("/api/leads/")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/session":
            self.session_status()
            return
        if path == "/api/leads":
            if not self.require_admin(False):
                return
            self.send_json(200, {"leads": db.list_leads()}, set_cookie=self.session_cookie(self.session_token))
            return
        if path == "/api/services":
            self.send_json(200, db.read_services())
            return
        if path == "/api/billing":
            if not self.require_admin(False):
                return
            self.send_json(200, db.billing_state(), set_cookie=self.session_cookie(self.session_token))
            return
        invoice_id = self.record_id("/api/invoices/")
        if invoice_id and path.startswith("/api/invoices/"):
            if not self.require_admin(False):
                return
            invoice = db.read_invoice(invoice_id)
            if not invoice:
                self.send_json(404, {"error": "Счёт не найден."})
                return
            self.send_json(200, {"invoice": invoice}, set_cookie=self.session_cookie(self.session_token))
            return
        redirects = {"/index.html": "/", "/admin.html": "/admin", "/crm.html": "/crm"}
        if path in redirects:
            self.send_response(302)
            self.send_header("Location", redirects[path])
            self.end_headers()
            return
        if not (DIST / "index.html").is_file():
            message = "Фронт ещё не собран. В папке сайта выполните: npm install && npm run build\n"
            body = message.encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        rel = path.lstrip("/")
        target = (DIST / rel).resolve() if rel else DIST.resolve()
        try:
            target.relative_to(DIST.resolve())
        except ValueError:
            self.send_error(403)
            return
        if rel and target.is_file():
            return super().do_GET()
        if rel and "." in Path(rel).name:
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

    def session_status(self):
        if PASSWORD_STATE != "ready":
            self.send_json(200, {"authenticated": False})
            return
        token = self.read_cookie()
        csrf = current_csrf(token)
        if not csrf:
            self.send_json(200, {"authenticated": False})
            return
        self.send_json(
            200,
            {"authenticated": True, "csrfToken": csrf},
            set_cookie=self.session_cookie(token),
        )

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            self.login()
            return
        if path == "/api/logout":
            self.logout()
            return
        if path == "/api/invoices":
            self.create_invoice()
            return
        if path != "/api/leads":
            self.send_error(404)
            return
        payload = self.read_json()
        if not self.origin_allowed():
            self.send_json(403, {"error": "Запрос отклонён."})
            return
        ip = self.client_ip()
        if limited(LEAD_POSTS, ip, LEAD_WINDOW, LEAD_LIMIT):
            self.send_json(429, {"error": "Слишком много заявок. Подождите и попробуйте снова."})
            return
        mark(LEAD_POSTS, ip, LEAD_WINDOW)
        lead = parse_lead(payload)
        if not lead:
            self.send_json(400, {"error": "Не хватает имени, контакта или текста заявки."})
            return
        lead["status"] = "new"
        lead["note"] = ""
        db.insert_lead(lead)
        self.send_json(201, {"ok": True, "id": lead["id"]})

    def login(self):
        payload = self.read_json()
        if PASSWORD_STATE != "ready":
            self.send_json(403, {"error": "Вход администратора не настроен."})
            return
        if not self.origin_allowed():
            self.send_json(403, {"error": "Запрос отклонён."})
            return
        ip = self.client_ip()
        if limited(LOGIN_FAILURES, ip, LOGIN_WINDOW, LOGIN_LIMIT):
            password_matches("invalid-password")
            self.send_json(429, {"error": "Слишком много попыток. Подождите и попробуйте снова."})
            return
        candidate = payload.get("password") if isinstance(payload, dict) else ""
        if not password_matches(candidate):
            mark(LOGIN_FAILURES, ip, LOGIN_WINDOW)
            self.send_json(401, {"error": "Неверный пароль."})
            return
        clear_marks(LOGIN_FAILURES, ip)
        token, csrf = create_session()
        self.send_json(200, {"ok": True, "csrfToken": csrf}, set_cookie=self.session_cookie(token))

    def logout(self):
        if not self.origin_allowed():
            self.send_json(403, {"error": "Запрос отклонён."})
            return
        token = self.read_cookie()
        csrf = current_csrf(token)
        if csrf and not self.csrf_matches(csrf):
            self.send_json(403, {"error": "Запрос отклонён."})
            return
        drop_session(token)
        self.send_json(200, {"ok": True}, set_cookie=self.clear_cookie())

    def do_PATCH(self):
        if urlparse(self.path).path.startswith("/api/invoices/"):
            self.patch_invoice()
            return
        lead_id = self.lead_id()
        payload = self.read_json()
        if not self.require_admin(True):
            return
        if not lead_id or not isinstance(payload, dict):
            self.send_json(400, {"error": "Некорректная заявка."})
            return
        status = payload.get("status")
        note = payload.get("note")
        if status is not None and status not in db.STATUSES:
            self.send_json(400, {"error": "Неизвестный статус."})
            return
        if note is not None and not isinstance(note, str):
            self.send_json(400, {"error": "Заметка должна быть текстом."})
            return
        note_text = note.strip()[:1000] if isinstance(note, str) else None
        if not db.update_lead(lead_id, status if status is not None else None, note_text if note is not None else None):
            self.send_json(404, {"error": "Заявка не найдена."})
            return
        self.send_json(200, {"ok": True}, set_cookie=self.session_cookie(self.session_token))

    def do_DELETE(self):
        lead_id = self.lead_id()
        if not self.require_admin(True):
            return
        if not lead_id:
            self.send_json(400, {"error": "Некорректная заявка."})
            return
        db.delete_lead(lead_id)
        self.send_json(200, {"ok": True}, set_cookie=self.session_cookie(self.session_token))

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/billing":
            self.save_billing()
            return
        if path == "/api/service-prices":
            self.save_service_price()
            return
        payload = self.read_json()
        if path != "/api/services":
            self.send_error(404)
            return
        if not self.require_admin(True):
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("services"), list):
            self.send_json(400, {"error": "Нужен список услуг."})
            return
        saved = db.replace_services(payload["services"])
        if saved is None:
            self.send_json(400, {"error": "Проверьте названия и состав услуг."})
            return
        self.send_json(200, {"services": saved, "source": "custom"}, set_cookie=self.session_cookie(self.session_token))

    def save_billing(self):
        payload = self.read_json()
        if not self.require_admin(True):
            return
        fields = clean_requisites(payload)
        if fields is None:
            self.send_json(400, {"error": "Проверьте ИИН/БИН и ставку НДС. Пустые поля можно оставить пустыми."})
            return
        self.send_json(200, {"requisites": db.save_requisites(fields)}, set_cookie=self.session_cookie(self.session_token))

    def save_service_price(self):
        payload = self.read_json()
        if not self.require_admin(True):
            return
        if not isinstance(payload, dict):
            self.send_json(400, {"error": "Некорректная цена."})
            return
        service_id = db.text(payload.get("id"), 80)
        if not service_id.replace("-", "").replace("_", "").isalnum():
            self.send_json(400, {"error": "Услуга не найдена."})
            return
        price = money_text(payload.get("price"))
        if price is None:
            self.send_json(400, {"error": "Укажите стоимость числом или оставьте поле пустым."})
            return
        if not db.set_service_price(service_id, price):
            self.send_json(404, {"error": "Услуга не найдена."})
            return
        self.send_json(200, {"id": service_id, "price": price}, set_cookie=self.session_cookie(self.session_token))

    def create_invoice(self):
        payload = self.read_json()
        if not self.require_admin(True):
            return
        cleaned = clean_snapshot(payload)
        if cleaned is None:
            self.send_json(400, {"error": "Проверьте номер, дату, реквизиты сторон и позиции. ИИН — 12 цифр, ИИК начинается с KZ, БИК — 8 или 11 символов, КБе — две цифры."})
            return
        invoice_id = uuid.uuid4().hex
        result = db.insert_invoice(
            invoice_id,
            cleaned["leadId"],
            cleaned["number"],
            cleaned["issuedOn"],
            cleaned["totalTiyn"],
            json.dumps(cleaned["snapshot"], ensure_ascii=False),
        )
        if result == "missing-lead":
            self.send_json(404, {"error": "Заявка не найдена."})
            return
        if result == "duplicate":
            self.send_json(409, {
                "error": "Счёт с таким номером уже есть.",
                "nextNumber": db.billing_state()["nextNumber"],
            })
            return
        saved = db.read_invoice(invoice_id)
        self.send_json(
            201,
            {"invoice": saved, "nextNumber": db.billing_state()["nextNumber"]},
            set_cookie=self.session_cookie(self.session_token),
        )

    def patch_invoice(self):
        invoice_id = self.record_id("/api/invoices/")
        payload = self.read_json()
        if not self.require_admin(True):
            return
        status = payload.get("status") if isinstance(payload, dict) else None
        if not invoice_id or status not in db.INVOICE_STATUSES:
            self.send_json(400, {"error": "Некорректный статус счёта."})
            return
        if not db.set_invoice_status(invoice_id, status):
            self.send_json(404, {"error": "Счёт не найден."})
            return
        self.send_json(200, {"ok": True}, set_cookie=self.session_cookie(self.session_token))

    def log_message(self, fmt, *args):
        if str(args[0]).startswith("GET /api") or str(args[0]).startswith(("POST", "PUT", "PATCH", "DELETE")):
            super().log_message(fmt, *args)


load_local_env()
configure_password()


def make_server():
    counts = db.summary()
    try:
        import backup_db
        print(f"Копия базы: {backup_db.create_backup()}")
    except Exception:
        print("Не удалось создать копию базы. Сайт запущен с текущей базой.")
    DIST.mkdir(exist_ok=True)
    host = site_host()
    port = site_port()
    server = Server((host, port), Handler)
    return server, counts, host, port


def serve():
    server, counts, host, port = make_server()
    print(f"Слушает: {host}:{port}")
    print(f"Сайт: http://127.0.0.1:{port}/")
    print(f"Услуги: http://127.0.0.1:{port}/admin")
    print(f"CRM:  http://127.0.0.1:{port}/crm")
    print(f"База: {db.DB_PATH}")
    print(f"В базе: услуг {counts['services']}, заявок {counts['leads']}")
    if PASSWORD_STATE == "ready":
        print("Вход администратора включён.")
    elif PASSWORD_STATE == "weak":
        print("Вход администратора выключен: ADMIN_PASSWORD не проходит проверку надёжности.")
    else:
        print("Вход администратора выключен: задайте ADMIN_PASSWORD.")

    def handle_stop(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    serve()
