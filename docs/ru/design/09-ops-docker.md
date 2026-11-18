# 09. Docker, размещение, эксплуатация

## 1. Состав контейнеров (как у панели: приложение, PostgreSQL, Redis-совместимое хранилище)
| Сервис | Образ | Роль | Сеть |
|---|---|---|---|
| `swellwright` | свой (multi-stage, non-root) | api + раздача интерфейса | внутренняя + публикация только на 127.0.0.1 за nginx |
| `swellwright-worker` | тот же образ, другая команда | выполнение сценариев, SSH, зонды | внутренняя + исходящие по allowlist |
| `postgres` | `postgres:17` (закреплён по дайджесту) | БД | только внутренняя |
| `valkey` | `valkey/valkey` (закреплён) | очереди, блокировки | только внутренняя |
| `swellwright-probe` | свой, отдельный образ (опц.) | агент зонда на машинах-наблюдателях | наружу только HTTPS к api |

Образы собираются командой `docker build` с `pnpm install --frozen-lockfile --ignore-scripts`; результат тегируется версией (`swellwright:1.0.0`), без `latest`. Релизные образы собирает и публикует CI (раздел 10); локальная сборка тоже возможна.

## 2. `docker-compose.yml` (эскиз)
```yaml
name: swellwright
services:
  swellwright:
    image: swellwright:${SW_VERSION}
    restart: unless-stopped
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://sw:${POSTGRES_PASSWORD}@postgres:5432/swellwright
      REDIS_URL: redis://valkey:6379
      SW_PUBLIC_URL: https://sw.example.com
    secrets: [pg_password]
    ports: ["127.0.0.1:3100:3000"]
    depends_on: { postgres: { condition: service_healthy }, valkey: { condition: service_healthy } }
    healthcheck: { test: ["CMD", "node", "dist/healthcheck.js"], interval: 15s, timeout: 3s, retries: 5 }
    networks: [internal, egress]
  swellwright-worker:
    image: swellwright:${SW_VERSION}
    command: ["node", "dist/worker.js"]
    restart: unless-stopped
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    env_file: .env
    networks: [internal, egress]
  postgres:
    image: postgres:17@sha256:...
    restart: unless-stopped
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U sw -d swellwright"], interval: 10s, retries: 5 }
    networks: [internal]
  valkey:
    image: valkey/valkey:8@sha256:...
    command: ["valkey-server", "--appendonly", "yes", "--save", ""]
    volumes: [valkeydata:/data]
    healthcheck: { test: ["CMD", "valkey-cli", "ping"], interval: 10s, retries: 5 }
    networks: [internal]
networks:
  internal: { internal: true }
  egress: {}
volumes: { pgdata: {}, valkeydata: {} }
secrets: { pg_password: { file: ./secrets/pg_password } }
```
Исходящий трафик ограничивается межсетевым экраном хоста (разрешены серверы инвентаря, панель, DNS-API, GitHub, Telegram), а не только Docker.

## 3. Переменные окружения (основные)
`SW_PUBLIC_URL`, `SW_VERSION`, `DATABASE_URL`, `REDIS_URL`, `SW_AUTH_KEY` (base64 от 32 случайных байт; запечатывает секреты TOTP, это не ключ хранилища, ADR 0014; обязателен в production), `SW_SETUP_TOKEN` (необязательный постоянный токен первого запуска), `SW_COOKIE_SECURE`, `SW_ALLOWED_ORIGINS`, `SW_STEP_UP_MINUTES` (сколько сессия остаётся повышенной после второго фактора, по умолчанию 5, от 1 до 30; ADR 0017), `SW_VAULT_KDF_MEMORY_MIB` и `SW_VAULT_KDF_PASSES` (стоимость Argon2id для новой фразы хранилища, по умолчанию 256 МиБ и 3; ADR 0018), `SW_LOG_LEVEL`, `SW_EGRESS_ALLOWLIST` (подсказка политике), `SW_UNSEAL_MODE` (`manual` по умолчанию, `file`, `systemd-creds`), `SW_METRICS_BASIC_AUTH` (для Prometheus), `SW_RETENTION_*`, `SW_TRUSTED_PROXIES`. **Мастер-пароль хранилища не передаётся через окружение.**

## 4. Обратный прокси (nginx, по образцу панели)
- Домен `sw.<база>`, сертификат (например wildcard на базовый домен), `proxy_pass http://127.0.0.1:3100`.
- Заголовки: `X-Forwarded-For`, `X-Forwarded-Proto: https`, без под-пути.
- WebSocket: `Upgrade`/`Connection`, `proxy_read_timeout` не менее 1 часа для терминала.
- Ограничение доступа: список адресов (доверенные сети, VPN), опционально mTLS; rate limiting; отдельные `location` для `/ws`.
- Закрытые `/metrics` и `/docs` для внешних адресов.

## 5. Размещение (на одном хосте с панелью или на отдельном)
Рекомендуется отдельный сервер; размещение на хосте панели допустимо с мерами изоляции: отдельный системный пользователь без sudo; отдельная docker-сеть и **свои** Postgres и Valkey (не панельные); нет доступа к `docker.sock` и к томам и сети панели; лимиты (`cpus`, `memory`, `pids`) и `read_only`; межсетевой экран с ограничением исходящих соединений контейнеров Swellwright; отдельный vhost и отдельные резервные копии; Swellwright не читает базу панели (только API); хост панели в инвентаре Swellwright как обычный сервер с ограниченным пользователем.
Ресурсы: перед запуском измерить запас CPU и RAM; базовая потребность Swellwright 2 vCPU и 2 ГБ RAM (рост от зондов и журналов).
Остаточный риск при общем хосте: общее ядро и хост; компрометация хоста затрагивает обе системы.

## 6. Первый запуск
`docker compose up -d` → открыть консоль и ввести токен установки, который сервер напечатал в журнал → создать владельца экземпляра (пароль, TOTP, коды восстановления) → создать и **распечатать** хранилище (пароль + файл ключа по желанию) → подключить панель (P01) → импортировать парк → усыновить ноды (N01) → настроить уведомления и расписания.

## 7. Эксплуатация
- **Обновления Swellwright:** новая версия образа → `prisma migrate deploy` → проверка `ready` → откат: предыдущий образ плюс восстановление базы из копии перед миграцией (автоматическая копия перед обновлением).
- **Резервные копии:** ежедневный `pg_dump` (шифрование в формате CMS: открытый ключ на сервере, приватный ключ хранится вне сервера у администратора), экспорт метаданных хранилища (шифртекст), копии вне сервера (внешнее хранилище), ежемесячная проверка восстановления в одноразовом Postgres.
- **Мониторинг:** `/health`, `/ready`, `/metrics` (Basic Auth), алерты на возраст блокировок, очередь, сроки токенов и сертификатов, размер БД.
- **Логи:** JSON, ротация Docker (`max-size`, `max-file`), хранение по политике, без секретов.
- **Часы:** NTP обязателен (сертификаты SSH и подписи вебхуков зависят от времени).

## 8. Аварийное восстановление (runbooks)
| Ситуация | Действия |
|---|---|
| Потерян пароль хранилища | распечатать ключом восстановления, показанным при настройке (консоль предлагает его под полем фразы); доли ключа (Shamir) придут позже; без ключа хранилище утрачено: перевыпуск всех секретов и повторное подключение панели и серверов (ноды живы, доступ по аварийному ключу) |
| Никто не может войти (владелец потерял пароль и аутентификатор) | на хосте Swellwright, с окружением сервера: `node dist/admin.js reset-credentials <логин>` удаляет учётные данные этой записи, завершает её сессии и печатает одноразовое приглашение; открыть консоль с ним, выбрать пароль, заново подключить аутентификатор. `node dist/admin.js users` показывает учётные записи. В цепочке аудита это `user.credentials.reset` с `via: cli` (ADR 0016) |
| Потерян сервер Swellwright | поднять на новой машине, восстановить БД из копии, распечатать хранилище, пересоздать токены агентов, проверить доступы |
| Повреждена БД | восстановление из последней копии, пересинхронизация панели и серверов, пометка запусков «неопределённое состояние» и сверка по снимкам |
| Swellwright скомпрометирован | отзыв токенов панели, смена CA SSH и ключей, смена DNS-секретов, аудит, перевыпуск (мастер N28) |
| Недоступна панель | запуски, зависящие от панели, ставятся на паузу; работа с серверами по SSH продолжается; сценарии «панель потом» |

## 9. Чек-лист усиления хоста
Обновления ОС, SSH по сертификату, UFW (разрешить 22 с доверенных, 443 с разрешённых), fail2ban, отключённый swap или шифрование, шифрование диска, отдельный пользователь, мониторинг целостности, закрытые порты БД и очереди, запрет на docker.sock в контейнерах, регулярные пересборки образов.

## 10. Выпуск проекта на GitHub
Сборка образов в GitHub Actions (multi-arch при необходимости), публикация в GHCR, теги по версии, закрепление по дайджесту, SBOM (CycloneDX), подписи cosign, проверки (линтеры, типы, тесты, gitleaks, Trivy, лицензии, `oasdiff`, проверка отсутствия данных экземпляров), релизные заметки из CHANGELOG, публикация OpenAPI как артефакта. Для установки в собственной инфраструктуре допустима и локальная сборка. Подробности в `13-plugins-and-opensource.md`.

## 11. Плагины-сайдкары
`community`-плагин поставляется как образ OCI с манифестом; Swellwright генерирует фрагмент `compose` (сервис `swellwright-plugin-<id>`, внутренняя сеть, `read_only`, `cap_drop: [ALL]`, лимиты, сетевая политика на разрешённые хосты) и **не получает `docker.sock`**: администратор применяет фрагмент командой `docker compose up -d`. Связь с ядром по аутентифицированному HTTP/gRPC; плагин не видит БД, Redis и чужие секреты, секрет выдаётся на время вызова.
