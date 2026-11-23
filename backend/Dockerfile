# syntax=docker/dockerfile:1
# Self-Notes API. Build context: the repository root (the image needs /VERSION).
#   docker build -f backend/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build \
 && npm prune --omit=dev \
 && npx prisma generate

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache openssl su-exec
ENV NODE_ENV=production
# SQLite database. Mount a host folder on /app/db to keep it (docker-compose.yml: ./db).
ENV DATABASE_URL=file:/app/db/prod.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY VERSION ./VERSION
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 docker-entrypoint.sh
EXPOSE 3000
# Starts as root only to give /app/db to the "node" user, then runs as "node": see the script.
ENTRYPOINT ["./docker-entrypoint.sh"]
