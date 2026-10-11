# Familywall add-on image. The build context is the repository root (GitHub Actions) or the folder
# prepared by `npm run addon:stage` for a local add-on (same layout, plus staged-files.txt).

FROM node:24-alpine AS build
WORKDIR /src
COPY . ./
# A local add-on folder copied over an older one keeps files removed since then: drop them.
RUN node scripts/prune-stale.mjs \
  && npm ci \
  && npm run build --workspace @familywall/shared \
  && npm run build --workspace @familywall/api \
  && npm run build --workspace @familywall/web

FROM node:24-alpine
ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/ichigo86x/familywall" \
      org.opencontainers.image.description="Familywall: calendario di famiglia per Home Assistant" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web
WORKDIR /app

# Radicale: the CalDAV server behind /dav that keeps lists, menu, birthdays, shifts and notes.
# It listens on localhost only; Familywall authenticates members in front of it.
RUN apk add --no-cache python3 \
  && python3 -m venv /opt/radicale \
  && /opt/radicale/bin/pip install --no-cache-dir "radicale==3.8.1"
ENV RADICALE_COMMAND="/opt/radicale/bin/python -m radicale"

# pyicloud (the library of Home Assistant's iCloud integration) for iCloud Reminders with the Apple ID login.
# Build tools are only needed when a dependency has no wheel for Alpine, and are removed afterwards.
RUN apk add --no-cache --virtual .icloud-build gcc musl-dev libffi-dev \
  && python3 -m venv /opt/icloud \
  && /opt/icloud/bin/pip install --no-cache-dir "pyicloud==2.6.5" \
  && apk del .icloud-build
ENV ICLOUD_PYTHON="/opt/icloud/bin/python"

# Every workspace manifest is needed for `npm ci`, but only the API's runtime dependencies are installed.
COPY --from=build /src/package.json /src/package-lock.json ./
COPY --from=build /src/apps/api/package.json apps/api/
COPY --from=build /src/apps/web/package.json apps/web/
COPY --from=build /src/packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @familywall/api --ignore-scripts && npm cache clean --force

COPY --from=build /src/packages/shared/dist packages/shared/dist
COPY --from=build /src/apps/api/dist apps/api/dist
COPY --from=build /src/apps/api/python apps/api/python
COPY --from=build /src/apps/web/dist web

EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/api/dist/main.js"]
