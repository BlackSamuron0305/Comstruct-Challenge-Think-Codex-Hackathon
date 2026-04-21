.PHONY: help up down restart logs ps seed migrate test lint gen-keys flutter-gen api-types clean deploy-init deploy-update deploy-logs deploy-status mobile-web-build mobile-web-publish

# Compose invocation — always runs from repo root so relative volume paths resolve correctly
COMPOSE = docker compose --project-directory . -f infra/compose/docker-compose.yml

help:
	@echo "comstruct dev shortcuts"
	@echo "  make up           - bring up full local stack"
	@echo "  make down         - stop stack and remove volumes"
	@echo "  make restart      - restart stack"
	@echo "  make logs         - tail all service logs"
	@echo "  make ps           - list running containers"
	@echo "  make gen-keys     - generate RS256 JWT keypair"
	@echo "  make migrate      - run alembic migrations on order + catalog"
	@echo "  make seed         - seed dev DB with sample products + users"
	@echo "  make test         - run all test suites"
	@echo "  make lint         - run all linters"
	@echo "  make api-types    - regenerate Dart + TS shared types"
	@echo "  make flutter-gen  - flutter build_runner codegen"
	@echo "  make deploy-init  - first-time VM deploy helper"
	@echo "  make deploy-update - update deployed stack after git pull"
	@echo "  make deploy-logs  - tail deployed stack logs"
	@echo "  make deploy-status - show deployed stack status"
	@echo "  make mobile-web-build - build Flutter web demo bundle"
	@echo "  make mobile-web-publish - publish Flutter web demo on :8090"

up:
	@if [ ! -f .env ]; then cp .env.example .env; echo ">> Created .env from template. Edit it and re-run."; exit 1; fi
	@if [ ! -f infra/keys/jwt_private.pem ]; then $(MAKE) gen-keys; fi
	$(COMPOSE) up --build -d
	@echo ">> Stack up. Gateway: http://localhost:8001  Web: http://localhost:8080  MinIO: http://localhost:9001"

down:
	$(COMPOSE) down -v

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

gen-keys:
	@mkdir -p infra/keys
	@if [ ! -f infra/keys/jwt_private.pem ]; then \
		openssl genpkey -algorithm RSA -out infra/keys/jwt_private.pem -pkeyopt rsa_keygen_bits:2048; \
		openssl rsa -pubout -in infra/keys/jwt_private.pem -out infra/keys/jwt_public.pem; \
		echo ">> Generated RS256 keypair in infra/keys/"; \
	else \
		echo ">> Keys already exist."; \
	fi

migrate:
	$(COMPOSE) exec order-service alembic upgrade head
	$(COMPOSE) exec catalog-service alembic upgrade head

seed:
	$(COMPOSE) exec catalog-service python -m src.scripts.seed_dev
	$(COMPOSE) exec order-service python -m src.scripts.seed_dev

test:
	cd services/ai-service && pytest tests/ -v
	cd services/order-service && pytest tests/ -v
	cd services/catalog-service && pytest tests/ -v
	cd apps/web && pnpm test

lint:
	cd apps/web && pnpm lint
	cd services/ai-service && ruff check src/
	cd services/order-service && ruff check src/
	cd services/catalog-service && ruff check src/

api-types:
	pnpm --filter ts-shared-types build
	@echo ">> Dart client regen: cd packages/dart-api-client && dart run bin/generate.dart"

flutter-gen:
	cd apps/mobile && flutter pub run build_runner build --delete-conflicting-outputs

clean:
	$(COMPOSE) down -v --remove-orphans
	rm -rf node_modules apps/*/node_modules services/*/node_modules
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +

deploy-init:
	./scripts/deploy.sh init

deploy-update:
	./scripts/deploy.sh update

deploy-logs:
	./scripts/deploy.sh logs

deploy-status:
	./scripts/deploy.sh status

mobile-web-build:
	./scripts/deploy-mobile-web.sh build

mobile-web-publish:
	./scripts/deploy-mobile-web.sh publish
