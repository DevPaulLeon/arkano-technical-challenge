FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY ms-transactions/package*.json ./
COPY ms-transactions/pnpm-lock.yaml ./

RUN pnpm install

COPY ms-transactions/ .
COPY shared/ ./shared

RUN pnpm run build

CMD ["node", "dist/src/main"]