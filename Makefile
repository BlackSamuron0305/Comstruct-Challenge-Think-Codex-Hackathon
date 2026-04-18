.PHONY: help up down restart logs ps seed migrate test lint gen-keys flutter-gen api-types clean

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

up:
	@if [ ! -f .env ]; then cp .env.example .env; echo ">> Created .env from template. Edit it and re-run."; exit 1; fi
	@if [ ! -f infra/keys/jwt_private.pem ]; then $(MAKE) gen-keys; fi
	docker compose up --build -d
	@echo ">> Stack up. Gateway: http://localhost:8001  Web: http://localhost:8080  MinIO: http://localhost:9001"

down:
	docker compose down -v

restart:
	docker compose restart

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

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
	docker compose exec order-service alembic upgrade head
	docker compose exec catalog-service alembic upgrade head

seed:
	docker compose exec catalog-service python -m src.scripts.seed_dev
	docker compose exec order-service python -m src.scripts.seed_dev

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
	docker compose down -v --remove-orphans
	rm -rf node_modules apps/*/node_modules services/*/node_modules
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +
