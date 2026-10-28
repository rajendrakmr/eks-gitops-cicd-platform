'use client';

import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { useGetCategoriesQuery, useGetProductsQuery } from '@/store/api';
import { useAppSelector } from '@/store/hooks';

const FEATURES = [
  { icon: '🚚', title: 'Fast, tracked delivery', text: 'Free shipping over $100 with live order status from pending to delivered.' },
  { icon: '🔒', title: 'Secure by design', text: 'JWT sessions with refresh-token rotation, rate limiting and role-based access.' },
  { icon: '⚡', title: 'Blazing fast catalog', text: 'Product pages are served from a Redis read-through cache in front of MongoDB.' },
  { icon: '🛒', title: 'Persistent cart', text: 'Your cart follows you across devices and never oversells: stock is reserved atomically.' },
  { icon: '📦', title: 'Order history', text: 'Every purchase is stored transactionally in PostgreSQL with full line-item detail.' },
  { icon: '📈', title: 'Live dashboard', text: 'Track spending, order status and a 7-day activity chart in one place.' },
];

export default function LandingPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { data, isLoading, isError } = useGetProductsQuery({ limit: 4, sort: 'rating' });
  const { data: categories } = useGetCategoriesQuery();

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="status">New season · Free shipping over $100</span>
            <h1 style={{ marginTop: '1rem' }}>Everything you need, delivered with care.</h1>
            <p className="lead">
              Discover electronics, fashion, home essentials, books and sports gear, all in one fast, secure store.
            </p>
            <div className="hero-cta">
              <Link href="/products" className="btn btn-lg">
                Shop the collection
              </Link>
              {user ? (
                <Link href="/dashboard" className="btn btn-ghost btn-lg">
                  Go to dashboard
                </Link>
              ) : (
                <Link href="/register" className="btn btn-ghost btn-lg">
                  Create an account
                </Link>
              )}
            </div>
          </div>
          <div className="hero-art" aria-hidden>
            {(data?.items ?? []).slice(0, 4).map((p) => (
              <img key={p.id} src={p.image} alt="" />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="row-between page-head">
            <h2>Top rated right now</h2>
            <Link href="/products" className="muted">
              View all →
            </Link>
          </div>
          {isError ? (
            <div className="alert alert-err">Could not load products. Make sure the API gateway is running.</div>
          ) : (
            <div className="grid grid-products">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" />)
                : data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </section>

      {categories && categories.length > 0 && (
        <section className="container" style={{ paddingBottom: '1rem' }}>
          <h2>Browse by category</h2>
          <div className="chips">
            {categories.map((c) => (
              <Link key={c} href={`/products?category=${encodeURIComponent(c)}`} className="chip">
                {c}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2>Why shop with us</h2>
          <div className="grid grid-3" style={{ marginTop: '1.25rem' }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="card feature">
                <div className="icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p className="muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: '4rem' }}>
        <div className="cta">
          <h2 style={{ fontSize: '2rem' }}>Ready to start shopping?</h2>
          <p style={{ opacity: 0.9 }}>Create a free account to save your cart and track every order.</p>
          <Link href={user ? '/products' : '/register'} className="btn btn-lg">
            {user ? 'Continue shopping' : 'Get started'}
          </Link>
        </div>
      </section>
    </>
  );
}
