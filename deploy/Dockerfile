# 3D Xiangqi — application images: Node mock backend AND Spring Boot backend.
# Built from the repository root:
#   docker build -f deploy/Dockerfile .                        # Node backend (default target)
#   docker build -f deploy/Dockerfile --target java-runtime .  # Spring Boot backend
#
# Both images bake in the frontend assets (public/) and the shared rules module
# (shared/), serve the SPA + STOMP WebSocket + REST API, and listen on 8080.
# docker-compose picks the target per service (xq_backend / xq_backend_java).

# ---------------------------------------------------------------------------
# Spring Boot backend (drop-in replacement) — target: java-runtime
# ---------------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS java-build
WORKDIR /src

# Pre-fetch dependencies for better layer caching.
COPY server-java/pom.xml ./
RUN mvn -q -B dependency:go-offline

COPY server-java/ ./
# Tests are the local gate (./mvnw test); the image build packages only.
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS java-runtime
WORKDIR /app
RUN addgroup -S xiangqi && adduser -S xiangqi -G xiangqi

COPY --from=java-build /src/target/xiangqi-server-*.jar /app/app.jar
COPY public/ /app/static/public/
COPY shared/ /app/static/shared/

# PORT/XQ_STATIC_ROOT map to server.port / xiangqi.static-root. The PostgreSQL
# datasource (SPRING_DATASOURCE_URL/USERNAME/PASSWORD) and the Redis room-state
# backend (REDIS_HOST/REDIS_PORT/REDIS_PASSWORD) are injected by compose.
ENV PORT=8080 \
    XQ_STATIC_ROOT=/app/static

EXPOSE 8080
USER xiangqi
CMD ["java", "-jar", "/app/app.jar"]

# ---------------------------------------------------------------------------
# Node mock backend (default target) — target: node-runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS node-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=node-deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY public/ ./public/
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
