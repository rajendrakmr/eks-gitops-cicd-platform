.DEFAULT_GOAL := help
COMPOSE ?= docker compose

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

init: ## Create .env with freshly generated secrets (does nothing if it exists)
	@test -f .env && echo ".env already exists" || { \
	  sed -e "s/^JWT_SECRET=.*/JWT_SECRET=$$(openssl rand -hex 32)/" \
	      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$(openssl rand -hex 16)/" .env.example > .env; \
	  echo "Created .env"; }

up: ## Build and start the whole stack on http://localhost
	$(COMPOSE) up -d --build

down: ## Stop the stack (keeps data volumes)
	$(COMPOSE) down

nuke: ## Stop the stack AND delete all data volumes
	$(COMPOSE) down -v

logs: ## Tail logs (make logs s=gateway)
	$(COMPOSE) logs -f --tail=100 $(s)

ps: ## Show container status
	$(COMPOSE) ps

scale: ## Run 3 replicas of every stateless backend service
	$(COMPOSE) up -d --scale gateway=3 --scale auth-service=3 --scale product-service=3 --scale order-service=3

monitoring: ## Start Prometheus (9090) and Grafana (3001) too
	$(COMPOSE) --profile monitoring up -d --build

test: test-auth test-gateway test-product test-order ## Run every unit test suite

test-auth:
	cd services/auth-service && npm ci && npm test

test-gateway:
	cd services/api-gateway && npm ci && npm test

test-product:
	cd services/product-service && go mod tidy && go vet ./... && go test ./...

test-order:
	cd services/order-service && pip install -q -r requirements.txt && python -m pytest -q

smoke: ## End-to-end check against a running stack (BASE_URL=http://localhost)
	python3 scripts/smoke_test.py

k8s-apply: ## Deploy to the current kubectl context (needs k8s/secret.yaml, see k8s/README.md)
	kubectl create namespace shopstream --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -f k8s/secret.yaml
	kubectl apply -k k8s/

.PHONY: help init up down nuke logs ps scale monitoring test test-auth test-gateway test-product test-order smoke k8s-apply
