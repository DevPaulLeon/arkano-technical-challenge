FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY ms-llm/package*.json ./
COPY ms-llm/pnpm-lock.yaml ./

RUN pnpm install

COPY ms-llm/ .
COPY shared/ ./shared

RUN pnpm run build

CMD ["node", "dist/src/main"]