"""Проверка перед запуском в контейнере. Локальный запуск идёт через server.py."""

import os
import sys
from pathlib import Path

DB = Path("/app/data/crm.sqlite")
ENV = Path("/app/.env")
DIST = Path("/app/dist/index.html")


def main():
    if not DIST.is_file():
        print("Остановка: во фронте контейнера нет dist/index.html.", file=sys.stderr)
        return 1
    if not ENV.is_file() or ENV.stat().st_size == 0 or ENV.stat().st_size > 16384:
        print("Остановка: не подключён существующий файл .env. Пароль в образ не копируется.", file=sys.stderr)
        return 1
    if not DB.is_file() or DB.stat().st_size == 0:
        print(f"Остановка: не найден существующий файл базы {DB}. Новая база не создаётся.", file=sys.stderr)
        return 1
    with DB.open("rb") as handle:
        header = handle.read(16)
    if header != b"SQLite format 3\x00":
        print(f"Остановка: {DB} не является файлом SQLite. Новая база не создаётся.", file=sys.stderr)
        return 1
    if not os.access(DB, os.W_OK) or not os.access(DB.parent, os.W_OK):
        print(f"Остановка: нет права записи в {DB}. Новая база не создаётся.", file=sys.stderr)
        return 1
    os.execv(sys.executable, [sys.executable, "-u", str(Path("/app/server.py"))])


if __name__ == "__main__":
    raise SystemExit(main())
