FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG SESSION_SECRET=build-only-placeholder-not-a-runtime-secret
ARG CAS_BASE_URL=http://cas.invalid

# The bypass is compiled into the browser bundle, so the demo's flag has to be present at build time too.
ARG PUBLIC_DEMO=1
ENV PUBLIC_DEMO=$PUBLIC_DEMO
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SESSION_SECRET=$SESSION_SECRET
ENV CAS_BASE_URL=$CAS_BASE_URL

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3005/ || exit 1

CMD ["node", "server.js"]
