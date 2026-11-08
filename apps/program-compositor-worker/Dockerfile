# syntax=docker/dockerfile:1.7

ARG NODE_BASE=node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea

FROM ${NODE_BASE} AS build

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

FROM ${NODE_BASE} AS native-build

ARG FFMPEG_VERSION=9.0.2
ARG FFMPEG_SHA256=8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e
ARG BROTLI_VERSION=1.2.1
ARG BROTLI_SHA256=98d35d11a78dc453aebb7d10c3748f3f73ff78c8267c0dc697b8631f67bf7e8f
ARG TIFF_VERSION=4.7.2
ARG TIFF_SHA256=4996f0c4f93094719b1ca5c6279b20e588773ba8a247533e486416fb662ddb88
ARG ZLIB_COMMIT=df84af25dc1942490e1d1c899a07619152a46148
ARG ZLIB_SHA256=03a76732cfaa124c58b67600699d935d081604385c03aa282f81a101b7536161
ARG CHROME_VERSION=156.0.8078.47
ARG CHROME_SHA256=e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50
ARG PULSEAUDIO_VERSION=17.0+dfsg1-2+b1
ARG PULSEAUDIO_SHA256=e2961c81af7acd26d86faf1450fef37cb976343046641fd734089591a8d5e026

COPY apps/program-compositor-worker/container/build-native-runtime.sh /usr/local/bin/
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  --mount=type=cache,target=/cache/downloads,sharing=locked \
  chmod 0555 /usr/local/bin/build-native-runtime.sh \
  && /usr/local/bin/build-native-runtime.sh

FROM ${NODE_BASE} AS runtime-base

ARG SOURCE_REVISION=unknown
ARG BUILD_IDENTIFIER=local
ARG NODE_BASE
ARG FFMPEG_VERSION=9.0.2
ARG BROTLI_VERSION=1.2.1
ARG TIFF_VERSION=4.7.2
ARG ZLIB_COMMIT=df84af25dc1942490e1d1c899a07619152a46148
ARG CHROME_VERSION=156.0.8078.47
ARG PULSEAUDIO_VERSION=17.0+dfsg1-2+b1
ARG ADAPTIVE_STAGE_V2_SHADOW_ENABLED=false
ARG ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=false
ARG ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=false
LABEL org.opencontainers.image.revision=$SOURCE_REVISION \
  org.opencontainers.image.base.name=$NODE_BASE \
  com.getbetweener.com.ffmpeg.version=$FFMPEG_VERSION \
  com.getbetweener.com.brotli.version=$BROTLI_VERSION \
  com.getbetweener.com.tiff.version=$TIFF_VERSION \
  com.getbetweener.com.zlib.commit=$ZLIB_COMMIT \
  com.getbetweener.com.chrome.version=$CHROME_VERSION \
  com.getbetweener.com.pulseaudio.version=$PULSEAUDIO_VERSION \
  com.getbetweener.com.adaptive-stage-v2.shadow-enabled=$ADAPTIVE_STAGE_V2_SHADOW_ENABLED \
  com.getbetweener.com.adaptive-stage-v2.diagnostics-enabled=$ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED \
  com.getbetweener.com.adaptive-stage-v2.compositor-render-enabled=$ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    adduser ca-certificates fonts-dejavu-core fonts-noto-color-emoji \
    libabsl20240722 libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
    libatspi2.0-0t64 libcap2 libcups2t64 libdbus-1-3 libdrm2 \
    libfftw3-single3 libgbm1 libglib2.0-0t64 libgstreamer-plugins-base1.0-0 \
    libgstreamer1.0-0 libgtk-3-0t64 libice6 libltdl7 libnspr4 libnss3 \
    liborc-0.4-0t64 libpango-1.0-0 libpulse0 libsm6 libsndfile1 libsoxr0 \
    libspeexdsp1 libsystemd0 libtdb1 libudev1 libwebrtc-audio-processing-1-3 \
    libwrap0 libx11-6 libx11-xcb1 libx264-164 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxtst6 \
    pulseaudio-utils xdg-utils xvfb \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=native-build /out/packages/ /tmp/native-packages/
RUN dpkg -i /tmp/native-packages/*.deb \
  && rm -rf /tmp/native-packages \
  && ldconfig \
  && test "$(node --version)" = "v24.22.1" \
  && test "$(dpkg-query -W -f='${Version}' libbrotli1)" = "1.2.1-0betweener1" \
  && test "$(dpkg-query -W -f='${Version}' libtiff6)" = "4.7.2-0betweener1" \
  && test "$(dpkg-query -W -f='${Version}' zlib1g)" = "1:1.3.2+gitdf84af25-0betweener1"
COPY --from=native-build /out/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=native-build /out/chrome/ /opt/chrome/
COPY --from=native-build /out/pulse/ /

RUN ! ldd /opt/chrome/chrome | grep -q 'not found' \
  && /opt/chrome/chrome --version | grep -q "Google Chrome for Testing ${CHROME_VERSION}" \
  && ! ldd /usr/bin/pulseaudio | grep -q 'not found' \
  && ffmpeg -hide_banner -version | grep -q "ffmpeg version ${FFMPEG_VERSION}" \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q ' aac ' \
  && ffmpeg -hide_banner -devices 2>/dev/null | grep -q x11grab \
  && ffmpeg -hide_banner -devices 2>/dev/null | grep -q pulse \
  && ffmpeg -hide_banner -protocols 2>/dev/null | grep -q rtmps \
  && ! ffmpeg -hide_banner -protocols 2>/dev/null | grep -q rist \
  && ! ffmpeg -hide_banner -demuxers 2>/dev/null | grep -q rtsp \
  && rm -f /usr/bin/mount /usr/bin/umount /usr/bin/nsenter /usr/bin/unshare \
    /usr/bin/apt /usr/bin/apt-* /usr/bin/dpkg /usr/bin/dpkg-* \
  && find / -xdev -type f -perm /6000 -exec chmod a-s {} + \
  && ! find / -xdev -type f -perm /6000 -print -quit | grep -q .

WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/program-compositor-worker/src ./src
COPY --from=build --chown=1000:1000 /repo/apps/program-compositor-worker/dist ./dist

ENV NODE_ENV=production \
  HOME=/tmp/home \
  XDG_CONFIG_HOME=/tmp/config \
  XDG_CACHE_HOME=/tmp/cache \
  BETWEENER_SOURCE_REVISION=$SOURCE_REVISION \
  BETWEENER_BUILD_IDENTIFIER=$BUILD_IDENTIFIER \
  ADAPTIVE_STAGE_MANIFEST_VERSION=adaptive-stage-v2.0.0-m1 \
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION=layout-plan-v2.0.0-m1 \
  PORT=8080 \
  CHROMIUM_PATH=/opt/chrome/chrome \
  FFMPEG_PATH=/usr/local/bin/ffmpeg \
  XVFB_PATH=/usr/bin/Xvfb \
  PACTL_PATH=/usr/bin/pactl \
  PULSEAUDIO_PATH=/usr/bin/pulseaudio

USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/worker.mjs"]

FROM runtime-base AS validation
COPY --chown=1000:1000 apps/program-compositor-worker/test/container-smoke.sh /tmp/container-smoke.sh
RUN sh /tmp/container-smoke.sh && rm /tmp/container-smoke.sh

FROM runtime-base AS runtime
