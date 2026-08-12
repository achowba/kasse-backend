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
RUN npm ci --omit=dev && npm cache clean --force

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

# Liveness is a TCP connect: it proves the process is accepting connections
# without depending on any route. It becomes a request to /health once the
# health module exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('node:net').connect({host:'127.0.0.1',port:process.env.PORT||3000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
