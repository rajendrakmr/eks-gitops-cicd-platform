package main

import "testing"

func TestListKeyIsDeterministic(t *testing.T) {
	q := ListQuery{Search: " Laptop ", Category: "Electronics", Sort: "price_asc", Page: 1, Limit: 12}
	q2 := ListQuery{Search: "laptop", Category: "Electronics", Sort: "price_asc", Page: 1, Limit: 12}
	if listKey("1", q) != listKey("1", q2) {
		t.Fatal("equivalent queries must share a cache key")
	}
}

func TestListKeyChangesWithVersionAndParams(t *testing.T) {
	q := ListQuery{Category: "Books", Sort: "newest", Page: 1, Limit: 12}
	if listKey("1", q) == listKey("2", q) {
		t.Fatal("bumping the version must change the key")
	}
	q2 := q
	q2.Page = 2
	if listKey("1", q) == listKey("1", q2) {
		t.Fatal("different pages must not collide")
	}
}

func TestParseListQueryClampsValues(t *testing.T) {
	q := normalizeQuery(ListQuery{Page: -3, Limit: 5000, Sort: "bogus"})
	if q.Page != 1 || q.Limit != 100 || q.Sort != "newest" {
		t.Fatalf("unexpected normalization: %+v", q)
	}
}
