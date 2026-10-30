# Деплой elvo.technology

Сайт: контейнер `elvo-web` (nginx со статикой) в сети `edge`, в `/opt/elvo`. HTTPS держит общий nginx Product Hub (`product-hub-prod-nginx-1`) и проксирует на `elvo-web:80`. Портов наружу контейнер не открывает.

Схема снята с кода `product-hub` и `sourcely` локально. Перед началом сверьте сервер: шаг 0.

## 0. Проверка сервера

```bash
docker ps --format '{{.Names}}' | grep -E 'nginx|certbot'
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'
docker exec product-hub-prod-nginx-1 ls /etc/nginx/conf.d /etc/nginx/product-hub
docker exec product-hub-prod-nginx-1 ls /etc/letsencrypt/live
```

Ожидается: контейнеры `nginx` и `certbot` проекта `product-hub-prod`, в `conf.d` файлы `default.conf` и `sourcely.conf`, в `/etc/nginx/product-hub` шаблоны, в `live` каталоги `producthub.work` и `sourcely.online`.

## 1. DNS (Namecheap → Advanced DNS)

Добавить две записи:

| Type | Host | Value |
|---|---|---|
| A Record | `@` | `138.197.180.116` |
| A Record | `www` | `138.197.180.116` |

IP взят из текущих записей `producthub.work` и `sourcely.online`. Сейчас A-записей у `elvo.technology` нет, конфликтовать нечему. MX и TXT (verification, SPF, DKIM, DMARC) не трогать.

Проверка:

```bash
dig +short elvo.technology A
dig +short www.elvo.technology A
```

## 2. Сайт

```bash
git clone https://github.com/MaksymZui/elvo-site.git /opt/elvo
cd /opt/elvo
bash deploy/deploy.sh
```

Сборка кодирует около 130 вариантов картинок в AVIF и WebP на том же сервере: на рабочей машине образ собрался за 41 с, на сервере будет дольше, с полной загрузкой CPU на это время. Дальнейшие обновления тоже идут через `bash deploy/deploy.sh`.

Проверка из сети `edge`:

```bash
docker run --rm --network edge alpine wget -qO- http://elvo-web/ | head -c 200
```

## 3. Патч Product Hub

Общий nginx собирает конфиги из шаблонов, запечённых в его образ (`client/Dockerfile` копирует `deploy/nginx/templates/`). Просто положить файл на сервер нельзя: при пересоздании контейнера он пропадёт. Правки делаются в репозитории Product Hub.

1. Скопировать шаблоны:

   ```bash
   cp /opt/elvo/deploy/nginx-elvo-http.conf deploy/nginx/templates/elvo-http.conf.template
   cp /opt/elvo/deploy/nginx-elvo.conf deploy/nginx/templates/elvo-https.conf.template
   ```

2. В `deploy/nginx/product-hub-conf.sh` добавить в конец блок:

   ```sh
   # ─── ELVO (ELVO_DOMAIN → elvo-web:80 у мережі edge); порожньо — блоку немає ───
   if [ -n "${ELVO_DOMAIN:-}" ]; then
     if has_cert "$ELVO_DOMAIN"; then
       tpl=elvo-https.conf.template
       echo "elvo: HTTPS для ${ELVO_DOMAIN}"
     else
       tpl=elvo-http.conf.template
       echo "elvo: сертифіката для ${ELVO_DOMAIN} ще немає — тільки HTTP"
     fi
     envsubst '${ELVO_DOMAIN}' <"$templates/$tpl" >"$out/elvo.conf"
   else
     rm -f "$out/elvo.conf"
     echo "elvo: ELVO_DOMAIN не задано — вимкнено"
   fi
   ```

3. В `docker-compose.prod.yml`, сервис `nginx`, блок `environment`, рядом с `SOURCELY_DOMAIN`:

   ```yaml
   ELVO_DOMAIN: ${ELVO_DOMAIN:-}
   ```

4. В `.env` на сервере:

   ```bash
   ELVO_DOMAIN=elvo.technology
   ```

5. Пересобрать nginx:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build nginx
   ```

   Контейнер пересоздаётся: это короткий простой producthub.work и sourcely.online. Делать в тихое время.

## 4. SSL

Способ тот же, что у Sourcely: certbot в контейнере, проверка webroot, сертификаты в томе `letsencrypt`. Продление уже автоматическое: контейнер `certbot` проверяет сертификаты раз в 12 часов, nginx раз в 12 часов перечитывает конфиг. Новый cron не нужен.

`deploy/init-ssl-site.sh` выпускает сертификат только на один домен, без `www`. Поэтому первый выпуск делается отдельной командой, из каталога Product Hub:

```bash
source <(grep -E '^LETSENCRYPT_EMAIL=' .env)
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot -d elvo.technology -d www.elvo.technology \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
docker compose -f docker-compose.prod.yml exec -T nginx sh -c 'product-hub-conf && nginx -t && nginx -s reload'
```

До этого шага DNS уже должен указывать на сервер, иначе проверка домена не пройдёт.

## 5. Проверка

```bash
curl -sI https://elvo.technology/ | grep -iE '^(HTTP|cache-control|strict-transport)'
curl -sI https://www.elvo.technology/ | grep -iE '^(HTTP|location)'
curl -sI http://elvo.technology/ | grep -iE '^(HTTP|location)'
curl -s --compressed -o /dev/null -w '%{size_download} байт\n' https://elvo.technology/
curl -sI -H 'Accept-Encoding: gzip' "https://elvo.technology$(curl -s https://elvo.technology/ | grep -oE '/_astro/[^"]+\.js' | head -1)" | grep -iE '^(cache-control|content-encoding)'
```

Ожидается: `/` отдаёт 200 с `cache-control: no-cache`; `www` и `http` отдают 301 на `https://elvo.technology/`; файлы `/_astro/*` приходят с `immutable` и `content-encoding: gzip`.

## Если что-то пошло не так

- **`502` на elvo.technology:** контейнер не запущен или не в сети `edge`. `docker ps | grep elvo-web`, затем шаг 2. Остальные сайты это не затрагивает: адрес `elvo-web` nginx резолвит при запросе.
- **`nginx -t` падает после патча:** откатить `ELVO_DOMAIN` в `.env` и пересоздать nginx. Блок сайта исчезнет, остальные сайты продолжат работать.
- **Откат сайта:** `git checkout <commit>` в `/opt/elvo` и `docker compose -f docker-compose.prod.yml up -d --build --wait`.
