FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM nginx:alpine
COPY deploy/nginx-site.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx-headers.conf /etc/nginx/snippets/elvo-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
