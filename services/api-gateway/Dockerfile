FROM node:20-alpine AS base
WORKDIR /workspace
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY services/api-gateway/package.json ./services/api-gateway/package.json
COPY packages/ts-shared-types/package.json ./packages/ts-shared-types/package.json
RUN pnpm install --no-frozen-lockfile

FROM base AS build
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/services ./services
COPY --from=deps /workspace/packages ./packages
COPY services/api-gateway ./services/api-gateway
COPY packages/ts-shared-types ./packages/ts-shared-types
WORKDIR /workspace/packages/ts-shared-types
RUN pnpm build
WORKDIR /workspace/services/api-gateway
RUN pnpm build

FROM base AS runtime
RUN apk add --no-cache curl
ENV NODE_ENV=production
COPY --from=deps /workspace/node_modules /workspace/node_modules
COPY --from=deps /workspace/services/api-gateway/node_modules /workspace/services/api-gateway/node_modules
COPY --from=build /workspace/services/api-gateway/dist ./services/api-gateway/dist
COPY --from=build /workspace/packages/ts-shared-types/dist ./packages/ts-shared-types/dist
COPY services/api-gateway/package.json ./services/api-gateway/package.json
COPY packages/ts-shared-types/package.json ./packages/ts-shared-types/package.json
WORKDIR /workspace/services/api-gateway
EXPOSE 8001
CMD ["node", "dist/index.js"]
