# Сайт собирается в образ. .env и data/crm.sqlite в образ не копируются.
FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM python:3.14-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    SITE_HOST=0.0.0.0 \
    SITE_PORT=8080

COPY server.py db.py backup_db.py docker_entrypoint.py ./
COPY --from=frontend /src/dist ./dist

EXPOSE 8080
ENTRYPOINT ["python", "-u", "docker_entrypoint.py"]
