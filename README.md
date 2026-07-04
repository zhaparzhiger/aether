# Aether — Корпоративный ИИ-Ассистент

SaaS-платформа корпоративного RAG-чатбота: компании загружают внутренние документы (PDF, DOCX, TXT) и получают ИИ-помощника, который знает регламенты, политики и процессы компании. Работает на Google Gemini (Vertex AI).

## Стек

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui — `frontend/`
- **Backend:** Express.js + TypeScript — `backend/`
- **БД:** PostgreSQL 16 + pgvector (Docker) — `docker-compose.yml`
- **AI:** Gemini `gemini-3.1-flash-lite` (чат) + `text-embedding-004` (эмбеддинги, 768 изм.) через Vertex AI, аутентификация по `google-key.json`

## Запуск

```bash
# 1. База данных (порт 5433 — 5432 занят локальным PostgreSQL)
docker compose up -d

# 2. Backend (порт 4000)
cd backend
npm install
npm run db:migrate   # только при первом запуске / изменении схемы
npm run dev

# 3. Frontend (порт 3002 — 3000/3001 заняты локальными сервисами)
cd frontend
npm install
npm run dev
```

Открыть http://localhost:3002

## Что нужно дозаполнить в .env

Всё уже настроено, кроме **Google OAuth** (вход через Google):

1. В [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0537370402) создайте **OAuth 2.0 Client ID** (тип Web application).
2. Добавьте `http://localhost:3002` в **Authorized JavaScript origins**.
3. Впишите Client ID в:
   - `backend/.env` → `GOOGLE_OAUTH_CLIENT_ID` (+ `GOOGLE_OAUTH_CLIENT_SECRET`)
   - `frontend/.env.local` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Без этого работает вход по email+паролю; кнопка Google просто не отображается.

## Реализовано

- Регистрация / вход (email+пароль, Google OAuth), JWT в httpOnly-cookies с авто-refresh
- Организации (мультитенантность, изоляция данных по `organization_id`)
- Команда и роли: Owner / Admin / Manager / Member, приглашения по email (SMTP Gmail)
- Документы: загрузка PDF/DOCX/TXT (кириллические имена файлов поддерживаются), автоматическая обработка (чанкинг → эмбеддинги → pgvector)
- Коллекции: карточки на странице «Документы», навигация по коллекции, загрузка сразу в выбранную коллекцию
- ИИ-чат: история, ссылки на источники, режимы ответа «Краткий / Подробный»
- Важные (общие) чаты: любой автор может отметить чат ⭐ — его увидит вся команда (read-only); вкладки «Мои / Важные / Все», «Все» доступна только Owner/Admin
- Company Memory: «Запомни: ...» в чате или в Настройках; факты учитываются во всех ответах организации
- Глобальный семантический поиск с фильтрами (коллекция, название файла, даты)
- Аналитика: счётчики, популярные вопросы, самые цитируемые документы, график вопросов за 14 дней
- Экспорт чата в PDF и Word (DOCX) с поддержкой кириллицы
- Автогенерация документов (вкладка «Генерация»): выбор загруженного шаблона + инструкция → готовый документ с предпросмотром, редактированием и скачиванием в DOCX/PDF

## Структура БД

`users`, `organizations`, `organization_members` (роль+статус+invite token), `document_collections`, `documents` (статусы pending→processing→ready/failed), `document_chunks` (vector(768)), `chats` (is_shared), `messages` (sources jsonb), `company_memory`.
