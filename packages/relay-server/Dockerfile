# ===== Stage 1: 依赖安装 =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ===== Stage 2: 运行时 =====
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S nodejs && adduser -S appuser -G nodejs

COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --chown=appuser:nodejs src/ ./src/

USER appuser
EXPOSE 3000

CMD ["node", "src/app.js"]
