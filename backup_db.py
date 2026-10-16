"""Копия data/crm.sqlite через SQLite Backup API. Старые копии не удаляет."""

import sqlite3
from datetime import datetime
from pathlib import Path

import db


def create_backup(source=None, folder=None):
    database = Path(source or db.DB_PATH)
    if not database.is_file():
        raise FileNotFoundError(database)
    destination_dir = Path(folder) if folder else database.parent / "backups"
    destination_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    destination = destination_dir / f"crm-{stamp}.sqlite"
    if destination.exists():
        destination = destination_dir / f"crm-{stamp}-{datetime.now().strftime('%f')}.sqlite"
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


if __name__ == "__main__":
    print(create_backup())
