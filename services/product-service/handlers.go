package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type Server struct {
	store *Store
	cache *Cache
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

// Defense in depth: the gateway already enforces this, but the service checks the
// identity header it injects as well.
func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-User-Role") != "admin" {
		writeErr(w, http.StatusForbidden, "admin access required")
		return false
	}
	return true
}

func validateProduct(p *Product) string {
	switch {
	case strings.TrimSpace(p.Name) == "":
		return "name is required"
	case p.Price < 0:
		return "price must be >= 0"
	case p.Stock < 0:
		return "stock must be >= 0"
	case strings.TrimSpace(p.Category) == "":
		return "category is required"
	}
	return ""
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	qs := r.URL.Query()
	page, _ := strconv.Atoi(qs.Get("page"))
	limit, _ := strconv.Atoi(qs.Get("limit"))
	q := normalizeQuery(ListQuery{
		Search: strings.TrimSpace(qs.Get("search")), Category: qs.Get("category"),
		Sort: qs.Get("sort"), Page: page, Limit: limit,
	})

	key := listKey(s.cache.Version(r.Context()), q)
	var cached ListResult
	if s.cache.Get(r.Context(), key, &cached) {
		w.Header().Set("X-Cache", "HIT")
		writeJSON(w, http.StatusOK, cached)
		return
	}
	res, err := s.store.List(r.Context(), q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load products")
		return
	}
	s.cache.Set(r.Context(), key, res)
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var cached Product
	if s.cache.Get(r.Context(), itemKey(idStr), &cached) {
		w.Header().Set("X-Cache", "HIT")
		writeJSON(w, http.StatusOK, cached)
		return
	}
	p, err := s.store.Get(r.Context(), id)
	if errors.Is(err, mongo.ErrNoDocuments) {
		writeErr(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load product")
		return
	}
	s.cache.Set(r.Context(), itemKey(idStr), p)
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) categories(w http.ResponseWriter, r *http.Request) {
	const key = "products:categories"
	var cached []string
	if s.cache.Get(r.Context(), key, &cached) {
		writeJSON(w, http.StatusOK, cached)
		return
	}
	cats, err := s.store.Categories(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load categories")
		return
	}
	s.cache.Set(r.Context(), key, cats)
	writeJSON(w, http.StatusOK, cats)
}

func (s *Server) invalidate(ctx context.Context, ids ...string) {
	s.cache.BumpVersion(ctx)
	keys := []string{"products:categories"}
	for _, id := range ids {
		keys = append(keys, itemKey(id))
	}
	s.cache.Del(ctx, keys...)
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	var p Product
	if !readJSON(w, r, &p) {
		return
	}
	if msg := validateProduct(&p); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	p.ID = primitive.NilObjectID
	p.Rating = 0
	if err := s.store.Create(r.Context(), &p); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create product")
		return
	}
	s.invalidate(r.Context())
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) update(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	idStr := r.PathValue("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var p Product
	if !readJSON(w, r, &p) {
		return
	}
	if msg := validateProduct(&p); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	out, err := s.store.Update(r.Context(), id, &p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		writeErr(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update product")
		return
	}
	s.invalidate(r.Context(), idStr)
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) remove(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	idStr := r.PathValue("id")
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid product id")
		return
	}
	ok, err := s.store.Delete(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete product")
		return
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "product not found")
		return
	}
	s.invalidate(r.Context(), idStr)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Internal API (service-to-service only; the gateway never routes /internal/*) ----

type reserveItem struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}

type reservedItem struct {
	ProductID string  `json:"productId"`
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	Image     string  `json:"image"`
	Quantity  int     `json:"quantity"`
}

// reserve decrements stock for every line, rolling back already-reserved lines on failure.
func (s *Server) reserve(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Items []reserveItem `json:"items"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if len(body.Items) == 0 {
		writeErr(w, http.StatusBadRequest, "items are required")
		return
	}

	reserved := make([]reservedItem, 0, len(body.Items))
	rollback := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		for _, it := range reserved {
			if id, err := primitive.ObjectIDFromHex(it.ProductID); err == nil {
				_ = s.store.Release(ctx, id, it.Quantity)
			}
		}
	}

	for _, it := range body.Items {
		id, err := primitive.ObjectIDFromHex(it.ProductID)
		if err != nil || it.Quantity < 1 {
			rollback()
			writeErr(w, http.StatusBadRequest, "invalid item: "+it.ProductID)
			return
		}
		p, err := s.store.Reserve(r.Context(), id, it.Quantity)
		if errors.Is(err, ErrInsufficientStock) {
			rollback()
			writeErr(w, http.StatusConflict, "insufficient stock for product "+it.ProductID)
			return
		}
		if err != nil {
			rollback()
			writeErr(w, http.StatusInternalServerError, "reservation failed")
			return
		}
		reserved = append(reserved, reservedItem{ProductID: it.ProductID, Name: p.Name, Price: p.Price, Image: p.Image, Quantity: it.Quantity})
	}

	ids := make([]string, len(reserved))
	for i, it := range reserved {
		ids[i] = it.ProductID
	}
	s.invalidate(r.Context(), ids...)
	writeJSON(w, http.StatusOK, map[string]any{"items": reserved})
}

func (s *Server) release(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Items []reserveItem `json:"items"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	ids := []string{}
	for _, it := range body.Items {
		id, err := primitive.ObjectIDFromHex(it.ProductID)
		if err != nil || it.Quantity < 1 {
			continue
		}
		if err := s.store.Release(r.Context(), id, it.Quantity); err == nil {
			ids = append(ids, it.ProductID)
		}
	}
	s.invalidate(r.Context(), ids...)
	w.WriteHeader(http.StatusNoContent)
}
