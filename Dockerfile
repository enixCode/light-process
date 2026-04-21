FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/cli.js", "serve", "/workflows", "--port", "3000"]
