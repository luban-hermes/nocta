# syntax=docker/dockerfile:1
# 夜航 Nocta — multi-stage image (node:20-alpine, Next.js standalone, non-root)

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# a self-contained Prisma CLI (same version as package.json) for `migrate deploy` at start-up
FROM node:20-alpine AS prisma-cli
RUN apk add --no-cache openssl
WORKDIR /opt/prisma-cli
COPY package.json /tmp/package.json
RUN PV="$(node -p "require('/tmp/package.json').dependencies.prisma")" \
 && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@${PV}"

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl su-exec tini wget
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/nocta.db
RUN addgroup -S -g 1001 nocta && adduser -S -u 1001 -G nocta nocta

COPY --from=builder --chown=nocta:nocta /app/.next/standalone ./
COPY --from=builder --chown=nocta:nocta /app/.next/static ./.next/static
COPY --from=builder --chown=nocta:nocta /app/public ./public
COPY --from=builder --chown=nocta:nocta /app/prisma ./prisma
COPY --from=builder --chown=nocta:nocta /app/agent ./agent
COPY --from=prisma-cli /opt/prisma-cli/node_modules /opt/prisma-cli/node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data && chown nocta:nocta /app/data

VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
