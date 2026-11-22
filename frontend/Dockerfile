# syntax=docker/dockerfile:1
# Self-Notes web app: static build served by nginx, which also proxies /api to the backend.
# Build context: the repository root (the build needs /VERSION).
#   docker build -f frontend/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY VERSION /app/VERSION
COPY frontend/ ./
RUN npm run build

FROM nginx:1.29-alpine
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
