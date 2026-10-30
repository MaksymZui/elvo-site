# ELVO — лендинг elvo.technology
Сайт-визитка направления ELVO: дроны и комплектующие, полезная нагрузка (камеры, payload), оптоволоконный кабель для FPV, комплексные решения. Цель — презентовать направление и привести к контакту: support@elvo.technology.

## Стек
- Astro (static output), TypeScript strict, Tailwind CSS 4.
- Анимации — только anime.js v4 (`animejs`): onScroll, createMotionPath, splitText, stagger, createDrawable. Других анимационных библиотек не добавлять.
- Картинки — astro:assets (<Picture>): AVIF + WebP, srcset 360/768/1280/1920, lazy везде кроме hero.
- Один шрифт, самохостинг (woff2), font-display: swap.

## Источники и ассеты (дизайнера нет — всё готовим сами)
- docs/1.jpg … docs/6.jpg — макеты секций по порядку. Текст брать дословно (исправлять только явные опечатки — списком в отчёт). Стиль: тёмный navy/почти чёрный фон, синие акценты и свечение, белая типографика.
- docs/drone.png (вид 3/4) и docs/drone-top.png (вид сверху) — сгенерированные дроны для scroll-анимации. Если фон не прозрачный или есть поля — убрать rembg, обрезать. Оптимизировать в WebP/AVIF с альфой (≤ 150 KB каждый), src/assets/. Зеркалить кодом (scaleX(-1)), отдельные файлы не нужны.
- Логотип ELVO — SVG: векторизация из макетов (vtracer) или пересборка шрифтом + знак; src/assets/logo.svg.
- Вырезка объектов (дроны/камеры/катушки) из макетов — rembg локально → src/assets/cutouts/. Плохие края — не использовать.
- Текст, впечатанный в JPG-фоны, закрываем кадрированием и градиентами. Если не выходит — список мест в отчёт (почищу вручную).
- Файлы в docs/ не изменять.

## Правила
- Mobile-first: от 360–430 px, потом планшет, десктоп. Без горизонтального скролла. Тач-цели ≥ 44 px, текст на мобиле ≥ 16 px.
- Весь текст — HTML, собран в src/content/site.ts.
- Цвета, отступы, радиусы — токены в CSS (@theme).
- Анимации: только transform/opacity, 60 fps на среднем Android. prefers-reduced-motion → без движения, контент сразу виден. Без JS контент тоже виден.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95; CLS < 0.05; LCP < 2.5 s; JS страницы ≤ 60 KB gzip (без картинок).
- SEO: title/description, Open Graph + Twitter (og-image 1200×630), favicon/apple-touch-icon, robots.txt, sitemap, canonical https://elvo.technology, семантика h1–h3, alt.
- Доступность: контраст AA, видимый focus, aria-label у иконок.
- Контакты: mailto:support@elvo.technology. Никаких секретов в коде.

## Команды
- npm run dev / build / preview
- npm run check — astro check + tsc
- npm run shots — Playwright 390/768/1440 в .local/shots/ + проверка горизонтального скролла
- npm run lh — Lighthouse mobile по preview, отчёт в .local/

## Деплой
- Тот же сервер, что Sourcely/Product Hub (Docker, сеть edge, общий nginx — контейнер product-hub-prod-nginx-1).
- Контейнер elvo-web (nginx:alpine со статикой) в сети edge; общий nginx проксирует elvo.technology и www → elvo-web:80.
- Файлы: Dockerfile (multi-stage node → nginx:alpine), docker-compose.prod.yml, deploy/nginx-elvo.conf (server-блок для общего nginx), deploy/deploy.sh (git pull → build → up -d), docs/DEPLOY.md.
- Кэш: /_astro/* immutable 1 год, html no-cache; gzip.
- DNS (Namecheap): A-записи @ и www на IP сервера. MX и TXT (Google Workspace: verification, SPF, DKIM, DMARC) НЕ трогать.

## Git
- origin = https://github.com/MaksymZui/elvo-site.git, ветка main. Коммит на логический пункт, сообщения на английском. Не пушить. .env не коммитить.

## Решения по ходу работы
Уточняют правила выше; при расхождении приоритет у этого блока.
- TypeScript зафиксирован на `~6.0`: `@astrojs/check` не поддерживает TS 7.
- `<Picture>` в Astro не умеет art direction. Разные кропы по брейкпоинтам — через `ArtPicture.astro` на `getImage()`.
- Макеты всего 1280×512. Конвейер: LaMa ONNX (убрать впечатанный текст) → Real-ESRGAN ×4 → кропы → src/assets/. Инструменты и модели в `.local/`, скрипты в `scripts/assets/`. Там, где LaMa даёт артефакты, — кадрирование и градиент.
- Дроны: фон уже прозрачный, поэтому чистка альфы и despill вместо rembg. Средние тона подняты (гамма 0.82), под дроном мягкое свечение градиентом: иначе тёмный корпус теряется на тёмных секциях. `drop-shadow` не использовать.
- Вырезки rembg и `src/assets/cutouts/` не используются: секции идут целыми кадрами.
- Мобайл и планшет (< lg): справа у текстовых блоков резерв под дрона, полоса 60 px (gutter 20 + 40). Дрон летит в этой полосе и не заходит на текст.
- Дрон садится у кнопки Contact в секции 6. Этой кнопки нет на макете, она добавлена ради посадки.
- Маршрут дрона считается от реальных позиций текста (src/scripts/drone.ts): на десктопе он держится в свободной колонке, пока блок текста пересекает линию полёта. Менять раскладку секций можно только с прогоном `npm run shots`: тест падает, если дрон задевает строку текста, ссылку или кнопку, на 5 ширинах в обе стороны скролла.
- anime.js импортируется только через src/scripts/anime.ts и только динамически.
- `createDrawable` анимирует штрих (repaint): единственное исключение из правила «только transform/opacity».
- Общий nginx собирает конфиг из шаблонов, запечённых в образ Product Hub: нужен патч в том репозитории, см. docs/DEPLOY.md. www → 301 на apex.
