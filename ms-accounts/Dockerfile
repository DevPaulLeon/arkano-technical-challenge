FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY ms-accounts/package*.json ./
COPY ms-accounts/pnpm-lock.yaml ./

RUN pnpm install

COPY ms-accounts/ .
COPY shared/ ./shared

RUN pnpm run build

CMD ["node", "dist/src/main"]