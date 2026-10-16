"""Проверка перед запуском в контейнере. Локальный запуск идёт через server.py."""

import os
import sys
from pathlib import Path

RAILWAY_KEYS = (
    "RAILWAY_PROJECT_ID",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_SERVICE_ID",
)


def database_path():
    return Path(os.environ.get("SITE_DB_PATH", "/app/data/crm.sqlite"))


def env_file_path():
    return Path(os.environ.get("SITE_ENV_FILE", "/app/.env"))


def dist_file_path():
    return Path(os.environ.get("SITE_DIST_FILE", "/app/dist/index.html"))


def railway_runtime():
    return any(os.environ.get(key, "").strip() for key in RAILWAY_KEYS)


def init_allowed():
    """Новая база только на Railway или при явном ALLOW_DB_INIT. Локальный Docker сам её не создаёт."""
    flag = os.environ.get("ALLOW_DB_INIT", "").strip().lower()
    if flag in {"1", "true", "yes"}:
        return True
    if flag in {"0", "false", "no"}:
        return False
    return railway_runtime()


def environment_ready():
    env_file = env_file_path()
    if env_file.is_file():
        size = env_file.stat().st_size
        if size == 0 or size > 16384:
            print("Остановка: не подключён существующий файл .env. Пароль в образ не копируется.", file=sys.stderr)
            return False
        return True
    if os.environ.get("ADMIN_PASSWORD", "").strip():
        return True
    print(
        "Остановка: не подключён существующий файл .env и не задан ADMIN_PASSWORD. Пароль в образ не копируется.",
        file=sys.stderr,
    )
    return False


def database_ready():
    database = database_path()
    if database.exists() and not database.is_file():
        print(f"Остановка: {database} не является файлом базы. Существующая база не заменяется.", file=sys.stderr)
        return False
    if database.is_file():
        if database.stat().st_size == 0:
            print(f"Остановка: {database} пустой. Существующая база не заменяется.", file=sys.stderr)
            return False
        with database.open("rb") as handle:
            header = handle.read(16)
        if header != b"SQLite format 3\x00":
            print(f"Остановка: {database} не является файлом SQLite. Существующая база не заменяется.", file=sys.stderr)
            return False
        if not os.access(database, os.W_OK) or not os.access(database.parent, os.W_OK):
            print(f"Остановка: нет права записи в {database}. Новая база не создаётся.", file=sys.stderr)
            return False
        return True
    if not init_allowed():
        print(f"Остановка: не найден существующий файл базы {database}. Новая база не создаётся.", file=sys.stderr)
        return False
    try:
        database.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        print(f"Остановка: нет права записи в {database.parent}. Новая база не создаётся.", file=sys.stderr)
        return False
    if database.exists() or not os.access(database.parent, os.W_OK):
        print(f"Остановка: нет права записи в {database}. Новая база не создаётся.", file=sys.stderr)
        return False
    print(f"База {database} будет создана при старте. Существующий файл не заменяется.")
    return True


def check():
    if not dist_file_path().is_file():
        print("Остановка: во фронте контейнера нет dist/index.html.", file=sys.stderr)
        return 1
    if not environment_ready() or not database_ready():
        return 1
    return 0


def main():
    result = check()
    if result != 0:
        return result
    os.execv(sys.executable, [sys.executable, "-u", str(Path("/app/server.py"))])


if __name__ == "__main__":
    raise SystemExit(main())
