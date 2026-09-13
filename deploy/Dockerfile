# 3D Xiangqi — application image (mock backend + static frontend).
# Built from the repository root:  docker build -f deploy/Dockerfile .
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY public/ ./public/
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
