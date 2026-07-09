# MagicHerbs — HTML + backend на Netlify Functions + Turso

Полный проект: фронтенд (`public/index.html`) и backend (Netlify Functions +
база данных). Готов к `git push` в репозиторий и подключению к Netlify.

## Архитектура

- **Фронтенд** — `public/index.html`, Netlify отдаёт его как статику.
- **Backend** — Express-приложение (`app.js`), обёрнутое в одну Netlify
  Function (`netlify/functions/api.js`). Запросы с фронтенда на `/api/...`
  автоматически перенаправляются на эту функцию (см. `netlify.toml`).
- **База данных** — [Turso](https://turso.tech) (облачный SQLite,
  совместимый по SQL, есть бесплатный тариф). Локально, без всякой настройки,
  тот же код работает с обычным файлом SQLite — переключение между "локальный
  файл" и "Turso" происходит только через переменные окружения, код не
  меняется (это возможности библиотеки `@libsql/client`).

```
Пользователь → Netlify (статика public/) → /api/* → Netlify Function → Turso (БД)
```

## Шаг 1. Локальный запуск (проверить, что всё работает)

```bash
npm install
npm run seed      # наполняет БД вашим текущим каталогом товаров (33 шт.)
npm run dev        # http://localhost:3000
```

Никакой Turso и Netlify для этого не нужно — по умолчанию используется
локальный файл `db/magicherbs.db`.

## Шаг 2. Завести базу данных в Turso

1. Зарегистрируйтесь на [turso.tech](https://turso.tech) и установите CLI
   (инструкция на сайте) либо используйте их веб-консоль.
2. Создайте базу:
   ```bash
   turso db create magicherbs
   ```
3. Получите данные для подключения:
   ```bash
   turso db show magicherbs --url          # -> TURSO_DATABASE_URL
   turso db tokens create magicherbs        # -> TURSO_AUTH_TOKEN
   ```
4. Впишите их в `.env` (скопируйте `.env.example` → `.env`) и один раз
   выполните `npm run seed` — теперь этот скрипт наполнит уже облачную базу.

## Шаг 3. Деплой на Netlify

1. Залейте проект в GitHub/GitLab (или используйте Netlify CLI —
   `netlify deploy`).
2. В Netlify: **Add new site → Import an existing project**, выберите
   репозиторий. Netlify сам подхватит настройки из `netlify.toml`
   (`publish = "public"`, `functions = "netlify/functions"`).
3. В **Site settings → Environment variables** добавьте те же переменные,
   что в `.env`:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `TELEGRAM_BOT_TOKEN` (токен вашего бота из BotFather)
4. Deploy. Готово — сайт и API будут на одном домене вида
   `https://ваш-сайт.netlify.app`, фронтенд ходит на `/api/...`, Netlify сам
   маршрутизирует эти запросы в функцию.

## Как это устроено внутри

### Один и тот же код — для локалки и для облака
`db/index.js` создаёт клиента `@libsql/client`:
- если `TURSO_DATABASE_URL` не задан → пишет в локальный файл;
- если задан → работает с Turso по HTTPS.

Ни один SQL-запрос в `routes/*.js` при этом не меняется.

### Один и тот же Express-app — для локалки и для Netlify
`app.js` содержит все роуты. `server.js` (локальный запуск) просто
подключает к нему `express.static` и вызывает `app.listen`.
`netlify/functions/api.js` оборачивает тот же `app.js` через
`serverless-http` — при каждом вызове функция переиспользует то же
Express-приложение, никакого дублирования кода.

### Почему не просто SQLite-файл, как раньше
Netlify Functions запускаются в изолированных, недолговечных контейнерах:
файловая система не сохраняется между вызовами. Turso — это тот же SQL и
почти тот же клиентский API, что и у `node:sqlite`, но данные хранятся в
облаке и переживают между вызовами функции.

### Структура проекта
```
magicherbs-netlify/
├── netlify.toml            # публикуемая папка, редирект /api/* → функция
├── app.js                  # Express-приложение (общее для локалки и Netlify)
├── server.js                # локальный dev-сервер (npm run dev)
├── netlify/functions/api.js # Netlify Function-обёртка
├── db/
│   └── index.js             # клиент libSQL + схема БД
├── routes/
│   ├── products.js
│   ├── auth.js
│   ├── authMiddleware.js
│   ├── cart.js
│   ├── favorites.js
│   ├── orders.js
│   └── asyncHandler.js
├── scripts/
│   ├── products.json        # исходные данные каталога
│   └── seed.js               # наполнение БД (локальной или Turso)
└── public/
    └── index.html            # фронтенд
```

## API

Всё то же самое, что уже проверено локально:

- `GET  /api/products`, `GET /api/products/:id`, `GET /api/products/categories`
- `POST /api/auth/telegram` (проверка HMAC-подписи Telegram initData, если задан `TELEGRAM_BOT_TOKEN`)
- `POST /api/auth/email` (демо-вход)
- `GET/POST/PUT/DELETE /api/cart`, `PUT /api/cart/bulk`
- `GET/POST/DELETE /api/favorites`, `PUT /api/favorites/bulk`
- `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`

Всё, что требует авторизации, ждёт заголовок `Authorization: Bearer <token>`
(токен фронтенд получает при входе и сам подставляет во все запросы —
ничего руками передавать не нужно).

## Продакшн-заметки

- Обязательно задайте `TELEGRAM_BOT_TOKEN` в Netlify env — иначе подлинность
  Telegram-входа не проверяется.
- Бесплатный тариф Turso ограничен по объёму/запросам — для магазина
  среднего размера обычно достаточно с запасом, но проверьте актуальные
  лимиты на turso.tech перед продакшн-запуском.
- `session_token` — простая случайная строка без срока действия; для более
  строгой безопасности можно добавить TTL и обновление токена.
