'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { useGetCategoriesQuery, useGetProductsQuery } from '@/store/api';

function Shop() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  // Wait for the user to stop typing so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: categories } = useGetCategoriesQuery();
  const { data, isFetching, isError } = useGetProductsQuery({ search: debounced, category, sort, page, limit: 12 });

  return (
    <div className="container page">
      <div className="page-head">
        <h1 style={{ fontSize: '2.2rem' }}>Shop</h1>
        <p className="muted">{data ? `${data.total} product${data.total === 1 ? '' : 's'}` : 'Loading products…'}</p>
      </div>

      <div className="toolbar">
        <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          aria-label="Sort"
        >
          <option value="newest">Newest</option>
          <option value="rating">Top rated</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>

      {isError && <div className="alert alert-err">Could not load products. Please try again.</div>}

      {data && data.items.length === 0 ? (
        <div className="card card-pad page-state">
          <h3>No products found</h3>
          <p className="muted">Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid grid-products" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {data
            ? data.items.map((p) => <ProductCard key={p.id} product={p} />)
            : Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" />)}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="muted">
            Page {data.page} of {data.pages}
          </span>
          <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="container page-state">Loading…</div>}>
      <Shop />
    </Suspense>
  );
}
