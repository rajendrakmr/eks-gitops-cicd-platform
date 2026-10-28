'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import {
  useCheckoutMutation,
  useGetCartQuery,
  useRemoveCartItemMutation,
  useUpdateCartItemMutation,
  type Order,
} from '@/store/api';
import { errMessage, formatMoney } from '@/lib/format';

function CartContent() {
  const { data: cart, isLoading } = useGetCartQuery();
  const [updateItem] = useUpdateCartItemMutation();
  const [removeItem] = useRemoveCartItemMutation();
  const [checkout, { isLoading: placing, error }] = useCheckoutMutation();
  const [placed, setPlaced] = useState<Order | null>(null);

  const onCheckout = async () => {
    try {
      setPlaced(await checkout().unwrap());
    } catch {
      /* shown via `error` */
    }
  };

  if (placed) {
    return (
      <div className="container page">
        <div className="card card-pad" style={{ maxWidth: 560, margin: '2rem auto', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🎉</div>
          <h2>Order placed!</h2>
          <p className="muted">
            Order <strong>#{placed.id.slice(0, 8)}</strong> · total <strong>{formatMoney(placed.total)}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <Link href="/dashboard" className="btn">
              View my orders
            </Link>
            <Link href="/products" className="btn btn-ghost">
              Keep shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="container page-state">Loading cart…</div>;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container page-state">
        <h2>Your cart is empty</h2>
        <p className="muted">Find something you love in the shop.</p>
        <Link href="/products" className="btn">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1 style={{ fontSize: '2.2rem' }}>Your cart</h1>
      <div className="cart-layout" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          {cart.items.map((item) => (
            <div className="cart-row" key={item.productId}>
              <img src={item.image} alt={item.name} />
              <div>
                <Link href={`/products/${item.productId}`} className="product-name">
                  {item.name}
                </Link>
                <div className="muted small">{formatMoney(item.price)} each</div>
              </div>
              <div className="qty">
                <button
                  disabled={item.quantity <= 1}
                  onClick={() => updateItem({ productId: item.productId, quantity: item.quantity - 1 })}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  disabled={item.quantity >= 99}
                  onClick={() => updateItem({ productId: item.productId, quantity: item.quantity + 1 })}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{formatMoney(item.price * item.quantity)}</strong>
                <div>
                  <button className="btn btn-danger btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => removeItem(item.productId)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="card card-pad">
          <h3>Order summary</h3>
          <div className="summary-line">
            <span className="muted">Items ({cart.itemCount})</span>
            <span>{formatMoney(cart.subtotal)}</span>
          </div>
          <p className="muted small">Tax and shipping are calculated at checkout. Free shipping over $100.</p>
          <div className="summary-line summary-total">
            <span>Subtotal</span>
            <span>{formatMoney(cart.subtotal)}</span>
          </div>
          {error && <div className="alert alert-err">{errMessage(error)}</div>}
          <button className="btn btn-block btn-lg" disabled={placing} onClick={onCheckout}>
            {placing ? 'Placing order…' : 'Place order'}
          </button>
        </aside>
      </div>
    </div>
  );
}

export default function CartPage() {
  return (
    <AuthGuard>
      <CartContent />
    </AuthGuard>
  );
}
