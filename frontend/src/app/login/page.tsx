'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLoginMutation } from '@/store/api';
import { useAppSelector } from '@/store/hooks';
import { errMessage } from '@/lib/format';

// Only allow same-site relative redirects (prevents open-redirect abuse of ?next=).
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { user, hydrated } = useAppSelector((s) => s.auth);
  const [login, { isLoading, error }] = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (hydrated && user) router.replace(next);
  }, [hydrated, user, router, next]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password }).unwrap();
    } catch {
      /* error rendered below from the mutation state */
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h2>Welcome back</h2>
        <p className="muted">Log in to view your cart, orders and dashboard.</p>
        {error && <div className="alert alert-err">{errMessage(error)}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-block" disabled={isLoading}>
          {isLoading ? 'Logging in…' : 'Log in'}
        </button>
        <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}>
          New here? <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create an account</Link>
        </p>
        <p className="muted small" style={{ textAlign: 'center' }}>
          Demo admin: admin@example.com / Admin@12345
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container page-state">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
