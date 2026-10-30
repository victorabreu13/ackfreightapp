FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# The Node image ships an older Corepack. Its signing keys reject the pinned
# pnpm release, and a fresh Cloud Build has no cached pnpm binary, so install
# stops at `pnpm install`. 0.34.0 runs on Node 22.11+ and knows the current keys.
RUN npm install -g corepack@0.34.0 \
  && corepack enable \
  && corepack prepare pnpm@10.33.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile
COPY . .
# Cloud Build can inherit the service's AUTH_URL. That value is the legacy
# *.a.run.app host from `status.url`, and next build will inline it.
RUN env -u AUTH_URL -u NEXTAUTH_URL -u APP_URL -u AUTH_TRUST_HOST \
  sh -c 'pnpm exec prisma generate && pnpm build'
ENV PORT=8080 \
    APP_URL=https://ack-guias-711303341686.us-east1.run.app \
    AUTH_URL=https://ack-guias-711303341686.us-east1.run.app \
    NEXTAUTH_URL=https://ack-guias-711303341686.us-east1.run.app \
    AUTH_TRUST_HOST=true
EXPOSE 8080
CMD ["pnpm", "start"]
