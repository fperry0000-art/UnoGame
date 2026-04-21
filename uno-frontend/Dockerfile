FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev --no-audit --no-fund

COPY . .

RUN npm run build

EXPOSE 3000

CMD npx serve -s dist -l $PORT
