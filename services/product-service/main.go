package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

var httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "product_http_request_duration_seconds",
	Help:    "HTTP request duration in seconds",
	Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
}, []string{"method", "route", "status"})

var cacheRequests = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "product_cache_requests_total",
	Help: "Redis cache lookups by result (hit|miss)",
}, []string{"result"})

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		route := r.Pattern // e.g. "GET /products/{id}" (Go 1.23+) - empty on older runtimes
		if route == "" {
			route = "unmatched"
		}
		httpDuration.WithLabelValues(r.Method, route, strconv.Itoa(rec.status)).Observe(time.Since(start).Seconds())
	})
}

func connectMongo(uri string) (*mongo.Client, error) {
	var lastErr error
	for attempt := 1; attempt <= 30; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
		if err == nil {
			err = client.Ping(ctx, nil)
		}
		cancel()
		if err == nil {
			return client, nil
		}
		lastErr = err
		log.Printf("waiting for mongodb (%d/30): %v", attempt, err)
		time.Sleep(2 * time.Second)
	}
	return nil, lastErr
}

func main() {
	mongoClient, err := connectMongo(env("MONGO_URL", "mongodb://localhost:27017"))
	if err != nil {
		log.Fatalf("mongodb unreachable: %v", err)
	}

	redisOpts, err := redis.ParseURL(env("REDIS_URL", "redis://localhost:6379"))
	if err != nil {
		log.Fatalf("invalid REDIS_URL: %v", err)
	}
	rdb := redis.NewClient(redisOpts)

	ttl, _ := time.ParseDuration(env("CACHE_TTL", "60s"))
	store := NewStore(mongoClient.Database(env("MONGO_DB", "products_db")).Collection("products"))
	cache := NewCache(rdb, ttl)

	initCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	if err := store.EnsureIndexes(initCtx); err != nil {
		log.Printf("index creation warning: %v", err)
	}
	seedIfEmpty(initCtx, store)
	cancel()

	s := &Server{store: store, cache: cache}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "product-service"})
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := mongoClient.Ping(ctx, nil); err != nil {
			writeErr(w, http.StatusServiceUnavailable, "mongodb unavailable")
			return
		}
		// Redis is a cache: its outage degrades latency but must not take the service out of rotation.
		if err := cache.Ping(ctx); err != nil {
			log.Printf("redis ping failed: %v", err)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.Handle("GET /metrics", promhttp.Handler())

	mux.HandleFunc("GET /products", s.list)
	mux.HandleFunc("GET /products/{id}", s.get)
	mux.HandleFunc("GET /categories", s.categories)
	mux.HandleFunc("POST /products", s.create)
	mux.HandleFunc("PUT /products/{id}", s.update)
	mux.HandleFunc("DELETE /products/{id}", s.remove)

	// Service-to-service only. The gateway has no route for /internal/*.
	mux.HandleFunc("POST /internal/reserve", s.reserve)
	mux.HandleFunc("POST /internal/release", s.release)

	srv := &http.Server{
		Addr:              ":" + env("PORT", "4002"),
		Handler:           metrics(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("product-service listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	_ = mongoClient.Disconnect(ctx)
	_ = rdb.Close()
}
