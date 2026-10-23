FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-zmq \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -filters 2>/dev/null | grep -q azmq

WORKDIR /app
COPY apps/program-audio-worker/package.json ./package.json
COPY apps/program-audio-worker/src ./src

ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/worker.mjs"]
