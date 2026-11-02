# Работещ сайт

Адрес: **https://zavarti-classroom.gogo-rusev31.workers.dev/**

Публикуван на 2 ноември 2026 г. в Cloudflare Workers. Учителският вход, зареждането на 25 имена и завъртането са проверени през живия HTTPS адрес.

Кодът се пази в GitHub, а частните настройки са отделни **Secret** стойности в Cloudflare. Нито този документ, нито публичният JavaScript съдържат имена на ученици или учителски пароли.

## Обновяване

Връзка Cloudflare → GitHub не е предоставена. Публикуването е направено директно през Cloudflare Dashboard. Нов commit в GitHub **не обновява автоматично** живия сайт.

Може да обновявате чрез Wrangler, както е описано в README, или през Dashboard:

1. `node scripts/build-dashboard.mjs`
2. Полученият `.wrangler/dashboard-worker.mjs` е самостоятелен модул с всички публични файлове.
3. В Cloudflare → `zavarti-classroom` → Edit code изберете последната Active/Latest версия и заменете `worker.js` със съдържанието на модула.
4. Проверете, че модулът е поставен изцяло, и изберете Deploy.
5. Запазете binding-а `LOGIN_LIMITER`, Namespace ID `5311973158`, 8 заявки / 60 секунди.
6. Запазете петте тайни: `TEACHER_USERNAME`, `TEACHER_HASH`, `TEACHER_SALT`, `SESSION_SECRET`, `CLASS_NAMES_JSON`.

Не поставяйте тайните вътре в `worker.js`. Учителският вход е записан само в локалния `.private/teacher-login.txt`.
