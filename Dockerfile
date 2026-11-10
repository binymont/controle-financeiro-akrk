FROM node:24-bookworm-slim AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY nest-cli.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "npm run db:deploy && node prisma/seed.cjs && exec node dist/main.js"]

FROM node:24-bookworm-slim AS compilar-interface
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev
COPY frontend ./
RUN npm run build

FROM nginx:stable-alpine AS interface
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilar-interface /app/dist /usr/share/nginx/html
