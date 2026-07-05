# Деплой Aether на бесплатные хостинги (Neon + Render)

Стек: **Neon** — PostgreSQL + pgvector, **Render** — backend (Express) и frontend (Next.js).
Всё на бесплатных тарифах.

> ⚠️ Ограничения free-тарифа Render:
> - Сервисы **засыпают** после ~15 мин простоя → первый запрос ~50 сек.
> - Диск **эфемерный**: загруженные файлы-оригиналы исчезают при передеплое.
>   Векторы в Neon сохраняются (чат работает), но скачивание оригинала и
>   повторная обработка после рестарта перестанут работать. Для демо — ок.

---

## Шаг 0. Запушить репозиторий на GitHub

Render деплоит из GitHub. Убедитесь, что репозиторий с этими правками (включая
`render.yaml`) запушен. Секреты (`google-key.json`, `.env`) в гит **не** попадают —
они уже в `.gitignore`.

---

## Шаг 1. База данных — Neon

1. Зайдите на https://neon.tech → Sign up (через GitHub).
2. **Create project** → регион любой ближний (напр. EU) → назовите `aether`.
3. Neon сразу создаст БД. Откройте **Connection string** (Dashboard → Connect) и
   скопируйте строку вида:
   ```
   postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
   ```
   Сохраните её — это `DATABASE_URL`.

pgvector включать вручную не нужно — миграция сама делает
`CREATE EXTENSION IF NOT EXISTS vector` при первом деплое бэкенда.

---

## Шаг 2. Развернуть сервисы на Render (Blueprint)

1. Зайдите на https://render.com → Sign up (через GitHub).
2. **New → Blueprint** → выберите ваш репозиторий `aether`.
3. Render прочитает `render.yaml` и покажет **два сервиса**: `aether-backend`
   и `aether-frontend`. Он запросит значения переменных с `sync: false`.

### Переменные бэкенда (`aether-backend`)
| Переменная | Значение |
|---|---|
| `DATABASE_URL` | строка подключения Neon из шага 1 |
| `GOOGLE_CREDENTIALS_JSON` | всё содержимое `google-key.json` **одной строкой** (см. ниже) |
| `GOOGLE_OAUTH_CLIENT_ID` | ваш OAuth Client ID (или оставьте пустым) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ваш OAuth Secret (или пусто) |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | для писем-приглашений (или пусто) |
| `FRONTEND_URL` | **пока оставьте пустым** — заполним в шаге 3 |

`JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` Render сгенерирует сам.

**Как получить `GOOGLE_CREDENTIALS_JSON` одной строкой** — выполните локально в
папке проекта (Git Bash):
```bash
cat google-key.json | tr -d '\n'
```
Скопируйте вывод целиком в значение переменной.

### Переменные фронтенда (`aether-frontend`)
| Переменная | Значение |
|---|---|
| `NEXT_PUBLIC_API_URL` | **пока оставьте пустым** — заполним в шаге 3 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | тот же OAuth Client ID (или пусто) |

4. Нажмите **Apply** — Render начнёт сборку. Бэкенд при сборке прогонит миграции
   в Neon. Дождитесь, пока оба сервиса получат URL вида
   `https://aether-backend-xxxx.onrender.com` и `https://aether-frontend-xxxx.onrender.com`.

---

## Шаг 3. Связать сервисы (URL друг друга)

Теперь, когда URL известны, пропишите их и передеплойте:

1. `aether-backend` → **Environment** → `FRONTEND_URL` =
   `https://aether-frontend-xxxx.onrender.com` (без слэша в конце) → **Save**.
2. `aether-frontend` → **Environment** → `NEXT_PUBLIC_API_URL` =
   `https://aether-backend-xxxx.onrender.com` → **Save**.
3. Так как `NEXT_PUBLIC_*` вшивается при сборке, нажмите на фронтенде
   **Manual Deploy → Deploy latest commit**, чтобы он пересобрался с новым URL.

После редеплоя откройте URL фронтенда — приложение должно работать.

---

## Шаг 4. Google OAuth и Gemini (если используете вход через Google)

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. В вашем OAuth 2.0 Client ID → **Authorized JavaScript origins** добавьте URL
   фронтенда `https://aether-frontend-xxxx.onrender.com`.
3. Сервисный аккаунт (`google-key.json`) уже передан через
   `GOOGLE_CREDENTIALS_JSON` — Gemini заработает сразу.

---

## Проверка

- `https://aether-backend-xxxx.onrender.com/health` → `{"ok":true}`.
- На фронтенде: регистрация/вход, загрузка документа, вопрос в чате.
- Первый запрос после простоя будет медленным (просыпается free-инстанс) — это норма.

## Если что-то не так
- **CORS/куки не проходят** → проверьте, что `FRONTEND_URL` на бэкенде точно равен
  URL фронтенда (протокол `https`, без завершающего `/`).
- **Миграция упала на сборке** → проверьте `DATABASE_URL` (должен быть с
  `?sslmode=require`).
- **Gemini не отвечает** → проверьте, что `GOOGLE_CREDENTIALS_JSON` — валидный JSON
  одной строкой и `GOOGLE_CLOUD_PROJECT` совпадает с проектом ключа.
