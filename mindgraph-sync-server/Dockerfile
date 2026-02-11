FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

RUN npm prune --omit=dev

RUN mkdir -p /app/data

ENV PORT=8080
ENV DB_PATH=/app/data/sync.db

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -q -O /dev/null http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
