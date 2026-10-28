'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGetProductQuery } from '@/store/api';
import { formatMoney } from '@/lib/format';
import { useAddToCart } from '@/lib/useAddToCart';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useGetProductQuery(id);
  const { add, isLoading: adding, message } = useAddToCart();
  const [qty, setQty] = useState(1);

  if (isLoading) return <div className="container page-state">Loading…</div>;
  if (isError || !product) {
    return (
      <div className="container page-state">
        <h2>Product not found</h2>
        <Link href="/products" className="btn">
          Back to shop
        </Link>
      </div>
    );
  }

  const soldOut = product.stock < 1;
  const max = Math.min(product.stock, 99);

  return (
    <div className="container page">
      <Link href="/products" className="muted small">
        ← All products
      </Link>
      <div className="detail" style={{ marginTop: '1rem' }}>
        <img src={product.image} alt={product.name} />
        <div>
          <span className="status">{product.category}</span>
          <h1 style={{ fontSize: '2.2rem', marginTop: '0.75rem' }}>{product.name}</h1>
          <p className="rating">★ {product.rating.toFixed(1)}</p>
          <div className="price-lg">{formatMoney(product.price)}</div>
          <p className="muted">{product.description}</p>
          <p className={soldOut ? 'text-err' : product.stock < 10 ? 'text-err' : 'text-ok'}>
            {soldOut ? 'Out of stock' : product.stock < 10 ? `Only ${product.stock} left` : 'In stock'}
          </p>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.25rem' }}>
            <div className="qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                −
              </button>
              <span>{qty}</span>
              <button onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max} aria-label="Increase quantity">
                +
              </button>
            </div>
            <button className="btn btn-lg" disabled={soldOut || adding} onClick={() => add(product.id, qty)}>
              {adding ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
          {message && (
            <p className={`small ${message.type === 'ok' ? 'text-ok' : 'text-err'}`} style={{ marginTop: '0.75rem' }}>
              {message.text} {message.type === 'ok' && <Link href="/cart" style={{ textDecoration: 'underline' }}>View cart</Link>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
