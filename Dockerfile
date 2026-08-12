# syntax=docker/dockerfile:1

# Build stage. Needs the dev dependencies for the Nest CLI and the TypeScript
# compiler, none of which ship to the runtime image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Dependency stage. Resolves production dependencies only, from the same
# lockfile, so the runtime image carries no build tooling.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts skips lifecycle hooks that only make sense in a checkout,
# such as husky installing git hooks, and avoids running arbitrary package
# install scripts in the image.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Runtime stage.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run unprivileged. The image ships with a `node` user, so there is nothing to
# create. Nothing at runtime writes to the filesystem.
USER node

EXPOSE 3000

# Liveness, not readiness. This endpoint checks nothing external on purpose: if
# it pinged the database, a database blip would mark every healthy instance
# unhealthy and turn a degradation into an outage. Readiness lives at
# /api/v1/health/ready and is for the load balancer, not for the restart policy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
