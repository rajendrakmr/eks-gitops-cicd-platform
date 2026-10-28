# ShopStream - polyglot e-commerce microservices

A scalable e-commerce platform built as microservices in **four languages**, backed by **PostgreSQL**, **MongoDB** and **Redis**, with a **Next.js + Redux Toolkit (RTK Query)** frontend and a complete DevOps toolchain (Docker, Compose, Kubernetes + autoscaling, GitHub Actions CI/CD, Prometheus/Grafana).

```
                    Browser
                       |
              nginx (compose) / Ingress (k8s)
              /                          \
        Next.js frontend            /api/*  API Gateway (Node.js)
        (React, Redux Toolkit,        JWT verify - RBAC - Redis rate limit
         RTK Query)                  /          |            \
                                    v           v             v
                         auth-service     product-service   order-service
                          (Node.js)           (Go)            (Python/FastAPI)
                            |    \            |    \            |     \
                            v     v           v     v           v      v
                       PostgreSQL  Redis   MongoDB  Redis   PostgreSQL  Redis
                       (users)  (sessions, (catalog) (cache) (orders)  (carts)
                                 lockout)
                                              ^                |
                                              +-- /internal/reserve|release (stock, service-to-service)
```

| Service | Language | Data store | Responsibility |
|---|---|---|---|
| `frontend` | TypeScript / Next.js 14 | - | Landing, login/register, catalog, product page, cart, user dashboard, admin product management |
| `api-gateway` | Node.js (Express) | Redis | Single entry point: JWT verification, role checks, identity-header injection, distributed rate limiting, routing |
| `auth-service` | Node.js | PostgreSQL `auth_db` + Redis | Register/login, rotating refresh tokens, brute-force lockout |
| `product-service` | Go | MongoDB `products_db` + Redis | Catalog CRUD, search/sort/paginate, read-through cache, atomic stock reservation |
| `order-service` | Python (FastAPI) | PostgreSQL `orders_db` + Redis | Cart (Redis hashes), checkout with stock reservation + compensation, orders, dashboard stats |

**Why these stores:** PostgreSQL for relational, transactional data (users, orders, money). MongoDB for the flexible, read-heavy catalog. Redis for everything that is fast, expiring or shared across replicas (cache, refresh tokens, carts, rate-limit counters, login lockout).

## Quick start (Docker)

```bash
make init        # creates .env with generated secrets
make up          # builds and starts everything -> http://localhost
make smoke       # end-to-end API checks against the running stack
```

* Site: http://localhost  - API: http://localhost/api/products
* Seeded admin: `admin@example.com` / `Admin@12345` (from `.env`; **change it**) - open **/dashboard/products** to manage the catalog.
* `make scale` runs 3 replicas of the gateway and every backend service behind nginx.
* `make monitoring` adds Prometheus (http://localhost:9090) and Grafana (http://localhost:3001, `admin` / `GRAFANA_PASSWORD`) with a provisioned dashboard and alert rules.
* `make logs s=gateway`, `make down`, `make nuke` (also deletes volumes). `make help` lists everything.

## API (all under `/api`)

| Method & path | Access | Notes |
|---|---|---|
| `POST /auth/register`, `/auth/login` | public | returns `{user, accessToken, refreshToken}`; login locks after 5 failures / 15 min |
| `POST /auth/refresh`, `/auth/logout` | public | refresh tokens rotate and are single-use |
| `GET /auth/me` | user | |
| `GET /products?search&category&sort&page&limit`, `GET /products/:id`, `GET /categories` | public | `X-Cache: HIT/MISS` header |
| `POST/PUT/DELETE /products` | admin | invalidates the cache |
| `GET/POST/PATCH/DELETE /cart[...]` | user | price/name always taken from the catalog, never from the client |
| `POST /orders`, `GET /orders`, `GET /orders/:id` | user | checkout reserves stock atomically, rolls back on failure |
| `GET /orders/stats` | user (own) / admin (global) | dashboard numbers |
| `PATCH /orders/:id/status` | admin | |

## Scalability design

* **Stateless services.** No in-process session or cart state; all shared state is in Redis/Postgres/Mongo, so any service scales horizontally (`--scale` in Compose, HPA in Kubernetes: 2-10 replicas at 70% CPU).
* **Cache.** Product reads go through Redis. List caches use a *version counter*: any catalog write bumps it, invalidating every cached page in O(1) with no `KEYS`/`SCAN`. Redis outage degrades to direct MongoDB reads. Redis runs `volatile-lru` so only keys with a TTL are evictable.
* **Rate limiting** is stored in Redis, so the limit is global across gateway replicas (and fails open if Redis is down).
* **No overselling.** Stock is decremented with a conditional atomic MongoDB update; multi-item checkouts compensate on failure.
* **Resilience.** Liveness (`/health`) vs readiness (`/ready`) probes, startup probes, graceful shutdown, rolling updates with `maxUnavailable: 0`, PodDisruptionBudgets, topology spread, preStop drain.

## Security notes

* The gateway **discards any client-supplied `X-User-*` header** and sets them only from a verified JWT; services trust those headers, and the `/internal/*` stock endpoints have no gateway route.
* Kubernetes: default-deny NetworkPolicies, non-root read-only containers, dropped capabilities, seccomp, secrets via `Secret` (use External Secrets / Sealed Secrets in production).
* Auth service refuses to boot in production with the dev `JWT_SECRET`. Passwords hashed with bcrypt; login timing equalised for unknown users.
* Known limitation: access tokens are bearer JWTs held in browser memory/storage by the frontend. For stricter XSS posture move tokens to httpOnly cookies.

## Kubernetes

```bash
# 1. set your registry owner and domain
sed -i 's#ghcr.io/OWNER#ghcr.io/<your-github-user>#g' k8s/*.yaml
#    edit k8s/30-ingress.yaml (host) and k8s/00-namespace.yaml (PUBLIC_ORIGIN)
# 2. create secrets
cp k8s/secret.example.yaml k8s/secret.yaml && $EDITOR k8s/secret.yaml
# 3. deploy (needs ingress-nginx and metrics-server; k8s >= 1.30 for the native preStop sleep)
make k8s-apply
kubectl -n shopstream get pods,hpa
BASE_URL=https://your-domain make smoke
```

`k8s/10-datastores.yaml` runs single-replica Postgres/Mongo/Redis StatefulSets for staging. For production use managed databases and remove that file from `kustomization.yaml`; just point the URLs in the service manifests at them.

## CI/CD (`.github/workflows/ci.yml`)

Pull request: per-service tests (Node `node:test`, Go `vet`+`test -race`, Python `pytest` with a Redis service, frontend typecheck/lint/build), `npm audit`, `docker compose config`, and `kubeconform` on the rendered manifests.
Push to `main`/tag: builds and pushes five images to GHCR (tagged with the commit SHA), Trivy scan. Optional deploy job (set repo variable `DEPLOY_ENABLED=true` and secret `KUBE_CONFIG`): pins images to the commit, applies, waits for rollouts, rolls back on failure. Put required reviewers on the `production` environment for a manual gate.

## Repository layout

```
frontend/                 Next.js app (store/api.ts = RTK Query endpoints)
services/api-gateway/     Node.js gateway        services/auth-service/     Node.js
services/product-service/ Go                     services/order-service/    Python
infra/                    nginx.conf, Postgres init
k8s/                      Kustomize manifests (HPA, PDB, NetworkPolicy, Ingress)
monitoring/               Prometheus config + alerts, Grafana provisioning + dashboard
scripts/smoke_test.py     End-to-end API test
docker-compose.yml  Makefile  .env.example  .github/workflows/ci.yml
```

## Running a service without Docker

Each service reads its config from environment variables (see `docker-compose.yml`). You need Postgres (`auth_db`, `orders_db`), MongoDB and Redis; then e.g. `cd services/auth-service && npm ci && npm start`, `cd services/product-service && go run .`, `cd services/order-service && uvicorn app.main:app --port 4003`, `cd frontend && npm run dev`.
