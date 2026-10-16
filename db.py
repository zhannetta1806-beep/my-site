"""SQLite-хранилище сайта: услуги и заявки, файл data/crm.sqlite."""

import json
import sqlite3
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "crm.sqlite"
LOCK = threading.Lock()
STATUSES = {"new", "work", "done"}

DEFAULT_SERVICES = [
    {
        "id": "audit",
        "title": "Санитарный аудит объекта",
        "description": "Прихожу и смотрю на объект как инспектор: помещения, оборудование, потоки, хранение, документы.",
        "result": "Письменный список замечаний и что с каждым делать",
    },
    {
        "id": "inspection",
        "title": "Подготовка к проверке СЭС",
        "description": "Приводим в порядок документы и журналы, разбираем, что и как показывать инспектору.",
        "result": "Спокойная проверка без сюрпризов",
    },
    {
        "id": "control",
        "title": "Производственный контроль",
        "description": "Составлю программу производственного контроля под ваш объект и объясню, как её выполнять.",
        "result": "Программа и график лабораторных исследований",
    },
    {
        "id": "outbreak",
        "title": "Документация, необходимая при проверках",
        "description": "Разберу, какие документы, журналы и договоры должны быть готовы к проверке на вашем объекте.",
        "result": "Перечень документов и что проверить в каждом",
    },
    {
        "id": "consult",
        "title": "Консультация и разбор предписания",
        "description": "Разберу предписание или спорный вопрос по санитарным нормам пункт за пунктом.",
        "result": "Ясный ответ и следующий шаг",
    },
    {
        "id": "opening",
        "title": "Открытие нового объекта",
        "description": "Кафе, салон, детский центр, склад — подскажу, какие требования учесть ещё до ремонта.",
        "result": "Перечень требований до того, как вложены деньги",
    },
]

PREVIOUS_OUTBREAK = {
    "title": "Если на объекте заболели люди",
    "description": "Порядок действий, дезинфекция, работа с контактными. Без паники и лишних мер.",
    "result": "Понятный план действий на первые сутки",
}


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            name TEXT NOT NULL,
            contact TEXT NOT NULL,
            object TEXT NOT NULL,
            message TEXT NOT NULL,
            services TEXT NOT NULL,
            status TEXT NOT NULL,
            note TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            result TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requisites (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL DEFAULT '',
            tax_id TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL DEFAULT '',
            bank TEXT NOT NULL DEFAULT '',
            iik TEXT NOT NULL DEFAULT '',
            bik TEXT NOT NULL DEFAULT '',
            kbe TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            vat_status TEXT NOT NULL DEFAULT 'none',
            vat_rate TEXT NOT NULL DEFAULT '',
            signatory_name TEXT NOT NULL DEFAULT '',
            signatory_title TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS service_prices (
            service_id TEXT PRIMARY KEY,
            price_text TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            lead_id TEXT NOT NULL,
            number TEXT NOT NULL UNIQUE,
            issued_on TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL,
            total_tiyn INTEGER NOT NULL,
            snapshot TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS invoices_by_lead ON invoices (lead_id, created_at);
        """
    )
    ensure_services(conn)
    return conn


def meta_get(conn, key, default=""):
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def meta_set(conn, key, value):
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def service_public(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "result": row["result"],
    }


def rename_outbreak(conn):
    current = next(item for item in DEFAULT_SERVICES if item["id"] == "outbreak")
    row = conn.execute("SELECT id, title, description, result FROM services WHERE title = ?", (PREVIOUS_OUTBREAK["title"],)).fetchone()
    if not row:
        return
    description = current["description"] if row["description"] == PREVIOUS_OUTBREAK["description"] else row["description"]
    result = current["result"] if row["result"] == PREVIOUS_OUTBREAK["result"] else row["result"]
    conn.execute(
        "UPDATE services SET title = ?, description = ?, result = ? WHERE id = ?",
        (current["title"], description, result, row["id"]),
    )


def ensure_services(conn):
    rename_outbreak(conn)
    count = conn.execute("SELECT COUNT(*) AS count FROM services").fetchone()["count"]
    source = meta_get(conn, "services_source")
    if count or source == "custom":
        if not source:
            meta_set(conn, "services_source", "custom")
            conn.commit()
        else:
            conn.commit()
        return
    for position, item in enumerate(DEFAULT_SERVICES):
        conn.execute(
            "INSERT INTO services (id, position, title, description, result) VALUES (?, ?, ?, ?, ?)",
            (item["id"], position, item["title"], item["description"], item["result"]),
        )
    meta_set(conn, "services_source", "seed")
    conn.commit()


def text(value, limit):
    return str(value or "").replace("\r\n", "\n").strip()[:limit]


def valid_id(value):
    token = text(value, 80)
    return bool(token) and token.replace("-", "").replace("_", "").isalnum()


def parse_service(item, position):
    if not isinstance(item, dict):
        return None
    if not valid_id(item.get("id")):
        return None
    title = text(item.get("title"), 120)
    if not title:
        return None
    return {
        "id": text(item.get("id"), 80),
        "position": position,
        "title": title,
        "description": text(item.get("description"), 500),
        "result": text(item.get("result"), 240),
    }


def read_services():
    with LOCK:
        conn = connect()
        try:
            rows = conn.execute("SELECT * FROM services ORDER BY position, rowid").fetchall()
            source = meta_get(conn, "services_source", "seed")
        finally:
            conn.close()
    return {"services": [service_public(row) for row in rows], "source": source}


def replace_services(items):
    if not isinstance(items, list) or len(items) > 100:
        return None
    parsed = []
    seen = set()
    for item in items:
        row = parse_service(item, len(parsed))
        if not row or row["id"] in seen:
            return None
        seen.add(row["id"])
        parsed.append(row)
    with LOCK:
        conn = connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM services")
            conn.executemany(
                "INSERT INTO services (id, position, title, description, result) VALUES (:id, :position, :title, :description, :result)",
                parsed,
            )
            meta_set(conn, "services_source", "custom")
            kept = [row["id"] for row in parsed]
            if kept:
                marks = ",".join("?" for _ in kept)
                conn.execute(f"DELETE FROM service_prices WHERE service_id NOT IN ({marks})", kept)
            else:
                conn.execute("DELETE FROM service_prices")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    return [service_public(row) for row in parsed]


EMPTY_REQUISITES = {
    "name": "",
    "taxId": "",
    "address": "",
    "bank": "",
    "iik": "",
    "bik": "",
    "kbe": "",
    "phone": "",
    "email": "",
    "vatStatus": "none",
    "vatRate": "",
    "signatoryName": "",
    "signatoryTitle": "",
}

INVOICE_STATUSES = {"unpaid", "paid"}


def requisites_from_row(row):
    if not row:
        return dict(EMPTY_REQUISITES)
    status = row["vat_status"] if row["vat_status"] in {"none", "vat"} else "none"
    return {
        "name": row["name"],
        "taxId": row["tax_id"],
        "address": row["address"],
        "bank": row["bank"],
        "iik": row["iik"],
        "bik": row["bik"],
        "kbe": row["kbe"],
        "phone": row["phone"],
        "email": row["email"],
        "vatStatus": status,
        "vatRate": row["vat_rate"],
        "signatoryName": row["signatory_name"],
        "signatoryTitle": row["signatory_title"],
    }


def read_requisites():
    with LOCK:
        conn = connect()
        try:
            row = conn.execute("SELECT * FROM requisites WHERE id = 1").fetchone()
        finally:
            conn.close()
    return requisites_from_row(row)


def save_requisites(fields):
    with LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO requisites (
                    id, name, tax_id, address, bank, iik, bik, kbe, phone, email,
                    vat_status, vat_rate, signatory_name, signatory_title
                ) VALUES (1, :name, :tax_id, :address, :bank, :iik, :bik, :kbe, :phone, :email,
                    :vat_status, :vat_rate, :signatory_name, :signatory_title)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    tax_id = excluded.tax_id,
                    address = excluded.address,
                    bank = excluded.bank,
                    iik = excluded.iik,
                    bik = excluded.bik,
                    kbe = excluded.kbe,
                    phone = excluded.phone,
                    email = excluded.email,
                    vat_status = excluded.vat_status,
                    vat_rate = excluded.vat_rate,
                    signatory_name = excluded.signatory_name,
                    signatory_title = excluded.signatory_title
                """,
                fields,
            )
            conn.commit()
            row = conn.execute("SELECT * FROM requisites WHERE id = 1").fetchone()
        finally:
            conn.close()
    return requisites_from_row(row)


def read_prices():
    with LOCK:
        conn = connect()
        try:
            rows = conn.execute("SELECT service_id, price_text FROM service_prices").fetchall()
        finally:
            conn.close()
    return {row["service_id"]: row["price_text"] for row in rows}


def set_service_price(service_id, price_text):
    with LOCK:
        conn = connect()
        try:
            found = conn.execute("SELECT id FROM services WHERE id = ?", (service_id,)).fetchone()
            if not found:
                return False
            if price_text:
                conn.execute(
                    """
                    INSERT INTO service_prices (service_id, price_text) VALUES (?, ?)
                    ON CONFLICT(service_id) DO UPDATE SET price_text = excluded.price_text
                    """,
                    (service_id, price_text),
                )
            else:
                conn.execute("DELETE FROM service_prices WHERE service_id = ?", (service_id,))
            conn.commit()
            return True
        finally:
            conn.close()


def next_invoice_number(conn):
    rows = conn.execute("SELECT number FROM invoices").fetchall()
    highest = 0
    for row in rows:
        number = row["number"]
        if number.isdigit() and len(number) <= 12:
            highest = max(highest, int(number))
    candidate = highest + 1
    while conn.execute("SELECT 1 FROM invoices WHERE number = ?", (str(candidate),)).fetchone():
        candidate += 1
    return str(candidate)


def billing_state():
    with LOCK:
        conn = connect()
        try:
            requisites = requisites_from_row(conn.execute("SELECT * FROM requisites WHERE id = 1").fetchone())
            prices = {row["service_id"]: row["price_text"] for row in conn.execute("SELECT service_id, price_text FROM service_prices")}
            number = next_invoice_number(conn)
        finally:
            conn.close()
    return {"requisites": requisites, "prices": prices, "nextNumber": number}


def invoice_summary(row):
    return {
        "id": row["id"],
        "number": row["number"],
        "issuedOn": row["issued_on"],
        "createdAt": row["created_at"],
        "status": row["status"] if row["status"] in INVOICE_STATUSES else "unpaid",
        "totalTiyn": row["total_tiyn"],
    }


def lead_from_row(row, invoices=None):
    try:
        services = json.loads(row["services"])
    except json.JSONDecodeError:
        services = []
    if not isinstance(services, list):
        services = []
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "name": row["name"],
        "contact": row["contact"],
        "object": row["object"],
        "message": row["message"],
        "services": [text(item, 160) for item in services if text(item, 160)][:12],
        "status": row["status"] if row["status"] in STATUSES else "new",
        "note": row["note"],
        "invoices": invoices or [],
    }


def list_leads():
    with LOCK:
        conn = connect()
        try:
            rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
            grouped = {}
            for item in conn.execute(
                "SELECT id, lead_id, number, issued_on, created_at, status, total_tiyn FROM invoices ORDER BY created_at DESC"
            ):
                grouped.setdefault(item["lead_id"], []).append(invoice_summary(item))
        finally:
            conn.close()
    return [lead_from_row(row, grouped.get(row["id"], [])) for row in rows]


def insert_invoice(invoice_id, lead_id, number, issued_on, total_tiyn, snapshot):
    with LOCK:
        conn = connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            lead = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
            if not lead:
                conn.rollback()
                return "missing-lead"
            taken = conn.execute("SELECT 1 FROM invoices WHERE number = ?", (number,)).fetchone()
            if taken:
                conn.rollback()
                return "duplicate"
            conn.execute(
                """
                INSERT INTO invoices (id, lead_id, number, issued_on, created_at, status, total_tiyn, snapshot)
                VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?)
                """,
                (invoice_id, lead_id, number, issued_on, datetime_now(), total_tiyn, snapshot),
            )
            conn.commit()
            return "ok"
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def datetime_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def read_invoice(invoice_id):
    with LOCK:
        conn = connect()
        try:
            row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        finally:
            conn.close()
    if not row:
        return None
    try:
        snapshot = json.loads(row["snapshot"])
    except json.JSONDecodeError:
        snapshot = None
    if not isinstance(snapshot, dict):
        return None
    summary = invoice_summary(row)
    summary["snapshot"] = snapshot
    return summary


def set_invoice_status(invoice_id, status):
    if status not in INVOICE_STATUSES:
        return False
    with LOCK:
        conn = connect()
        try:
            current = conn.execute("SELECT id FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
            if not current:
                return False
            conn.execute("UPDATE invoices SET status = ? WHERE id = ?", (status, invoice_id))
            conn.commit()
            return True
        finally:
            conn.close()


def insert_lead(lead):
    with LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO leads (id, created_at, name, contact, object, message, services, status, note)
                VALUES (:id, :created_at, :name, :contact, :object, :message, :services, :status, :note)
                ON CONFLICT(id) DO NOTHING
                """,
                lead,
            )
            conn.commit()
        finally:
            conn.close()


def update_lead(lead_id, status=None, note=None):
    with LOCK:
        conn = connect()
        try:
            current = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
            if not current:
                return False
            if status is not None:
                conn.execute("UPDATE leads SET status = ? WHERE id = ?", (status, lead_id))
            if note is not None:
                conn.execute("UPDATE leads SET note = ? WHERE id = ?", (note, lead_id))
            conn.commit()
            return True
        finally:
            conn.close()


def delete_lead(lead_id):
    with LOCK:
        conn = connect()
        try:
            conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
            conn.commit()
        finally:
            conn.close()


def summary():
    with LOCK:
        conn = connect()
        try:
            services = conn.execute("SELECT COUNT(*) AS count FROM services").fetchone()["count"]
            leads = conn.execute("SELECT COUNT(*) AS count FROM leads").fetchone()["count"]
        finally:
            conn.close()
    return {"services": services, "leads": leads}
