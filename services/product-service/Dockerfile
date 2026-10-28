FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
COPY *.go ./
# go.sum is generated here when it is not committed (run `go mod tidy` locally and commit it for reproducible builds).
RUN go mod tidy && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/product-service .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/product-service /product-service
EXPOSE 4002
USER nonroot
# distroless has no shell/wget: liveness/readiness are probed by the orchestrator via /health and /ready.
ENTRYPOINT ["/product-service"]
