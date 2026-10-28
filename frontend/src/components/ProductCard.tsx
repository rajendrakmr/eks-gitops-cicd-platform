'use client';

import Link from 'next/link';
import type { Product } from '@/store/api';
import { formatMoney } from '@/lib/format';
import { useAddToCart } from '@/lib/useAddToCart';

export default function ProductCard({ product }: { product: Product }) {
  const { add, isLoading, message } = useAddToCart();
  const soldOut = product.stock < 1;

  return (
    <article className="card product-card">
      <Link href={`/products/${product.id}`} className="product-img">
        <img src={product.image} alt={product.name} loading="lazy" />
        {soldOut && <span className="tag tag-out">Sold out</span>}
      </Link>
      <div className="product-body">
        <span className="muted small">{product.category}</span>
        <Link href={`/products/${product.id}`} className="product-name">
          {product.name}
        </Link>
        <div className="row-between">
          <strong>{formatMoney(product.price)}</strong>
          <span className="small rating">★ {product.rating.toFixed(1)}</span>
        </div>
        <button className="btn btn-block" disabled={soldOut || isLoading} onClick={() => add(product.id)}>
          {isLoading ? 'Adding…' : soldOut ? 'Unavailable' : 'Add to cart'}
        </button>
        {message && <p className={`small ${message.type === 'ok' ? 'text-ok' : 'text-err'}`}>{message.text}</p>}
      </div>
    </article>
  );
}
