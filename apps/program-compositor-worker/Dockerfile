FROM node:24-bookworm-slim AS build

ARG SOURCE_REVISION=unknown
ARG BUILD_IDENTIFIER=local
ARG ADAPTIVE_STAGE_V2_SHADOW_ENABLED=false
ARG ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=false
ARG ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=false
ENV VITE_SOURCE_REVISION=$SOURCE_REVISION \
  VITE_BUILD_IDENTIFIER=$BUILD_IDENTIFIER \
  VITE_ADAPTIVE_STAGE_V2_SHADOW_ENABLED=$ADAPTIVE_STAGE_V2_SHADOW_ENABLED \
  VITE_ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=$ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED \
  VITE_ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=$ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED

WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/studio/package.json ./apps/studio/package.json
COPY apps/program-audio-worker/package.json ./apps/program-audio-worker/package.json
COPY apps/program-compositor-worker/package.json ./apps/program-compositor-worker/package.json
COPY packages/live-program-domain/package.json ./packages/live-program-domain/package.json
RUN npm ci --ignore-scripts

COPY packages/live-program-domain ./packages/live-program-domain
COPY apps/program-compositor-worker ./apps/program-compositor-worker
RUN npm run build --workspace @betweener/program-compositor-worker

FROM node:24-bookworm-slim AS runtime

ARG SOURCE_REVISION=unknown
ARG BUILD_IDENTIFIER=local
LABEL org.opencontainers.image.revision=$SOURCE_REVISION

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium dbus ffmpeg fonts-dejavu-core fonts-noto-color-emoji pulseaudio pulseaudio-utils xvfb \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264

WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/program-compositor-worker/src ./src
COPY --from=build --chown=node:node /repo/apps/program-compositor-worker/dist ./dist

ENV NODE_ENV=production \
  BETWEENER_SOURCE_REVISION=$SOURCE_REVISION \
  BETWEENER_BUILD_IDENTIFIER=$BUILD_IDENTIFIER \
  ADAPTIVE_STAGE_MANIFEST_VERSION=adaptive-stage-v2.0.0-m1 \
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION=layout-plan-v2.0.0-m1 \
  PORT=8080 \
  CHROMIUM_PATH=/usr/bin/chromium \
  FFMPEG_PATH=/usr/bin/ffmpeg \
  XVFB_PATH=/usr/bin/Xvfb \
  PACTL_PATH=/usr/bin/pactl \
  PULSEAUDIO_PATH=/usr/bin/pulseaudio

USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/worker.mjs"]
