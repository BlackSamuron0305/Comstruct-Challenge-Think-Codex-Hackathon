FROM node:20-alpine AS dev
WORKDIR /workspace

RUN corepack enable
ENV NODE_ENV=development

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ts-shared-types/package.json ./packages/ts-shared-types/package.json

RUN pnpm install --filter @comstruct/web... --no-frozen-lockfile

COPY apps/web ./apps/web
COPY packages/ts-shared-types ./packages/ts-shared-types

EXPOSE 5173
WORKDIR /workspace/apps/web
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
