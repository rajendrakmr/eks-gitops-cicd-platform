package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache is a read-through cache backed by a dedicated Redis instance.
// Every method degrades gracefully: if Redis is down the service keeps serving from MongoDB.
type Cache struct {
	rdb *redis.Client
	ttl time.Duration
}

const versionKey = "products:list:version"

func NewCache(rdb *redis.Client, ttl time.Duration) *Cache {
	return &Cache{rdb: rdb, ttl: ttl}
}

func (c *Cache) Get(ctx context.Context, key string, dest any) bool {
	raw, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		cacheRequests.WithLabelValues("miss").Inc()
		return false
	}
	if json.Unmarshal(raw, dest) != nil {
		cacheRequests.WithLabelValues("miss").Inc()
		return false
	}
	cacheRequests.WithLabelValues("hit").Inc()
	return true
}

func (c *Cache) Set(ctx context.Context, key string, v any) {
	raw, err := json.Marshal(v)
	if err != nil {
		return
	}
	_ = c.rdb.Set(ctx, key, raw, c.ttl).Err()
}

func (c *Cache) Del(ctx context.Context, keys ...string) {
	if len(keys) > 0 {
		_ = c.rdb.Del(ctx, keys...).Err()
	}
}

// Version returns the current list-cache generation. Bumping it invalidates every
// cached list page at once without needing SCAN/KEYS.
func (c *Cache) Version(ctx context.Context) string {
	v, err := c.rdb.Get(ctx, versionKey).Result()
	if err != nil {
		return "0"
	}
	return v
}

func (c *Cache) BumpVersion(ctx context.Context) {
	_ = c.rdb.Incr(ctx, versionKey).Err()
}

func (c *Cache) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }

func itemKey(id string) string { return "products:item:" + id }

// listKey builds a deterministic cache key for a list query.
func listKey(version string, q ListQuery) string {
	raw := fmt.Sprintf("%s|%s|%s|%d|%d", strings.ToLower(strings.TrimSpace(q.Search)), q.Category, q.Sort, q.Page, q.Limit)
	sum := sha256.Sum256([]byte(raw))
	return "products:list:v" + version + ":" + hex.EncodeToString(sum[:8])
}
