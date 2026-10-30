# ELVO — лендинг elvo.technology
Сайт-визитка направления ELVO: дроны и комплектующие, полезная нагрузка (камеры, payload), оптоволоконный кабель для FPV, комплексные решения. Цель — презентовать направление и привести к контакту: support@elvo.technology.

## Стек
- Astro (static output), TypeScript strict, Tailwind CSS 4.
- Анимации — только GSAP (`gsap`, точная версия) с плагинами ScrollTrigger, SplitText, DrawSVGPlugin. Других анимационных библиотек не добавлять.
- Картинки — astro:assets (<Picture>): AVIF + WebP, srcset 360/768/1280/1920, lazy везде кроме hero.
- Один шрифт, самохостинг (woff2), font-display: swap.

## Источники и ассеты (дизайнера нет — всё готовим сами)
- docs/1.jpg … docs/6.jpg — макеты секций по порядку. Текст брать дословно (исправлять только явные опечатки — списком в отчёт). Стиль: тёмный navy/почти чёрный фон, синие акценты и свечение, белая типографика.
- docs/drone.png и docs/drone-top.png — исходники снятой с сайта анимации дрона. На сайте не используются.
- Логотип ELVO — SVG: векторизация из макетов (vtracer) или пересборка шрифтом + знак; src/assets/logo.svg.
- Текст, впечатанный в JPG-фоны, закрываем кадрированием и градиентами. Если не выходит — список мест в отчёт (почищу вручную).
- Файлы в docs/ не изменять.

## Правила
- Mobile-first: от 360–430 px, потом планшет, десктоп. Без горизонтального скролла. Тач-цели ≥ 44 px, текст на мобиле ≥ 16 px.
- Весь текст — HTML, собран в src/content/site.ts.
- Цвета, отступы, радиусы — токены в CSS (@theme).
- Анимации: только transform/opacity/clip-path, 60 fps на среднем Android. prefers-reduced-motion → без движения, контент сразу виден. Без JS контент тоже виден.
- Полноэкранные секции: каждая в `Screen.astro`, `min-height: 100svh`, контент по центру, никакой фиксированной высоты: если контент не влезает, секция растёт. Header плавает поверх, его высоту учитывает верхний отступ секции. Последняя секция с футером дают ровно экран.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95; CLS < 0.05; LCP < 2.5 s; JS страницы ≤ 60 KB gzip (без картинок).
- SEO: title/description, Open Graph + Twitter (og-image 1200×630), favicon/apple-touch-icon, robots.txt, sitemap, canonical https://elvo.technology, семантика h1–h3, alt.
- Доступность: контраст AA, видимый focus, aria-label у иконок.
- Контакты: mailto:support@elvo.technology. Никаких секретов в коде.

## Команды
- npm run dev / build / preview
- npm run check — astro check + tsc
- npm run shots — Playwright 360/390/768/1024/1440: по кадру на секцию в .local/shots/, горизонтальный скролл, высоты секций, обрезание контента в секциях 5–6, pin, snap, якоря, CPU ×4 при скролле, reduced-motion, JS off, заблокированный чанк GSAP
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
- Макеты всего 1280×512. Конвейер: `inpaint.py` (LaMa убирает впечатанный текст) → `outpaint.py` (LaMa достраивает кадр до 1280×800) → Real-ESRGAN ×4 → `crops.py` → src/assets/. Инструменты и модели в `.local/`, скрипты в `scripts/assets/`. Там, где LaMa даёт артефакты, — кадрирование и градиент.
- Фоны 16:10 содержат зоны сверху и снизу, выдуманные LaMa: без них 2.5:1 на экране 16:10 теряет треть ширины. Кадр лежит в коробке `.frame` с размером как у `cover`, поэтому выноски и линии волокна остаются на картинке при любых пропорциях.
- Текст поверх фото — только от 1024 px и пропорций 3:2 (вариант Tailwind `wide:`). Ниже, включая 1024×768, раскладка «картинка + текст».
- Вырезки rembg не используются: секции идут целыми кадрами.
- Кнопки Contact в секции 6 нет на макете, она добавлена как целевое действие.
- GSAP импортируется только через src/scripts/gsap.ts и только динамически, вся настройка в одном `gsap.matchMedia` в src/scripts/motion.ts. Сам закреплённый элемент не анимировать: pin на `section`, scale на `.screen__body`.
- ≥ 768 px: стопка (pin с `pinSpacing: false`), snap к границам секций, в секциях выше экрана snap не работает. < 768 px: pin, стопка и snap выключены целиком, zoom фона слабее.
- CSS `scroll-behavior: smooth` с snap не работает: ScrollTrigger его отключает, поэтому якоря идут через `followAnchors` в motion.ts.
- `DrawSVGPlugin` анимирует штрих (repaint): единственное исключение из правила про transform/opacity/clip-path.
- Общий nginx собирает конфиг из шаблонов, запечённых в образ Product Hub: нужен патч в том репозитории, см. docs/DEPLOY.md. www → 301 на apex.
