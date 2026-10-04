# Build context is this folder; `npm run addon:stage` copies the monorepo sources into ./app first.

FROM node:24-alpine AS build
WORKDIR /src
COPY app/ ./
RUN npm ci \
  && npm run build --workspace @familywall/shared \
  && npm run build --workspace @familywall/api \
  && npm run build --workspace @familywall/web

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web
WORKDIR /app

# Radicale: the CalDAV server behind /dav that syncs the family lists with iOS Reminders.
# It listens on localhost only; Familywall authenticates members in front of it.
RUN apk add --no-cache python3 \
  && python3 -m venv /opt/radicale \
  && /opt/radicale/bin/pip install --no-cache-dir "radicale==3.8.1"
ENV RADICALE_COMMAND="/opt/radicale/bin/python -m radicale"

# Every workspace manifest is needed for `npm ci`, but only the API's runtime dependencies are installed.
COPY --from=build /src/package.json /src/package-lock.json ./
COPY --from=build /src/apps/api/package.json apps/api/
COPY --from=build /src/apps/web/package.json apps/web/
COPY --from=build /src/packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @familywall/api --ignore-scripts && npm cache clean --force

COPY --from=build /src/packages/shared/dist packages/shared/dist
COPY --from=build /src/apps/api/dist apps/api/dist
COPY --from=build /src/apps/web/dist web

EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/api/dist/main.js"]
