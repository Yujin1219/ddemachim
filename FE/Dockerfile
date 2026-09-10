# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
ARG VITE_BASE_PATH=/machim/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public

# Only browser-facing VITE_* values belong in this file. The file itself is
# mounted for this step and is not copied into an image layer.
RUN --mount=type=secret,id=vite_env,target=/app/.env,required=true npm run build

FROM nginx:stable-alpine AS runtime
ENV BACKEND_UPSTREAM=http://backend:8080
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
