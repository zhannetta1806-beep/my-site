"""Копия data/crm.sqlite через SQLite Backup API. Старые копии не удаляет и исходный файл не заменяет."""

import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import db

RAILWAY_KEYS = (
    "RAILWAY_PROJECT_ID",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_SERVICE_ID",
)


def railway_runtime():
    return any(os.environ.get(key, "").strip() for key in RAILWAY_KEYS)


def inside(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def offsite_directory(database):
    """Каталог копии вне папки базы. На Railway по умолчанию /app/backups, это не том /app/data."""
    raw = os.environ.get("BACKUP_DIR", "").strip()
    if not raw and railway_runtime():
        raw = "/app/backups"
    if not raw:
        return None
    candidate = Path(raw)
    data_root = database.resolve().parent
    try:
        resolved = candidate.resolve()
    except OSError:
        return None
    if inside(resolved, data_root) or resolved == data_root:
        return None
    return candidate


def write_backup(database, destination_dir):
    destination_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    destination = destination_dir / f"crm-{stamp}.sqlite"
    if destination.exists():
        destination = destination_dir / f"crm-{stamp}-{datetime.now().strftime('%f')}.sqlite"
    if destination.resolve() == database.resolve():
        raise RuntimeError("Копия не может заменить исходную базу.")
    origin = sqlite3.connect(f"file:{database.resolve().as_posix()}?mode=ro", uri=True)
    try:
        target = sqlite3.connect(destination)
        try:
            origin.backup(target)
        finally:
            target.close()
    finally:
        origin.close()
    check = sqlite3.connect(f"file:{destination.resolve().as_posix()}?mode=ro", uri=True)
    try:
        integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        check.close()
    if integrity != "ok":
        destination.unlink(missing_ok=True)
        raise RuntimeError("Копия базы не прошла проверку целостности.")
    return destination


def create_backup(source=None, folder=None):
    database = Path(source or db.DB_PATH)
    if not database.is_file():
        raise FileNotFoundError(database)
    folders = [Path(folder) if folder else database.parent / "backups"]
    if folder is None:
        extra = offsite_directory(database)
        if extra is not None:
            folders.append(extra)
    written = []
    errors = []
    for destination_dir in folders:
        try:
            written.append(write_backup(database, destination_dir))
        except Exception as exc:
            errors.append(exc)
    if not written:
        raise errors[0]
    if errors:
        print(f"Дополнительная копия базы не создана: {errors[0]}", file=sys.stderr)
    elif len(written) > 1:
        print(f"Дополнительная копия базы: {written[1]}")
    return written[0]


if __name__ == "__main__":
    print(create_backup())
