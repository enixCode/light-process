FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY package.json ./

EXPOSE 3000

CMD ["node", "dist/cli.js", "serve", "/workflows"]
