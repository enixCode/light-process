FROM node:22-alpine AS builder

WORKDIR /app

# UI: install deps first (cached as long as ui/package*.json don't change)
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci --no-audit --no-fund

# UI: build static export → ui/out (next.config.ts has output:'export')
COPY ui ./ui
RUN cd ui && npm run build

# Server: install deps. --ignore-scripts skips the `prepare` hook
# (scripts/install-hooks.sh isn't part of the build context).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# Server: compile TS. --ignore-scripts skips `prebuild` (UI already built above).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build --ignore-scripts


FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui/out ./ui/out

EXPOSE 3000

CMD ["node", "dist/cli.js", "serve", "/workflows", "--port", "3000"]
