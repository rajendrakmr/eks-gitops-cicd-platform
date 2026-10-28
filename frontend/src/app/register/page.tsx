'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/api';
import { useAppSelector } from '@/store/hooks';
import { errMessage } from '@/lib/format';

export default function RegisterPage() {
  const router = useRouter();
  const { user, hydrated } = useAppSelector((s) => s.auth);
  const [register, { isLoading, error }] = useRegisterMutation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (hydrated && user) router.replace('/dashboard');
  }, [hydrated, user, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(form).unwrap();
    } catch {
      /* rendered from mutation state */
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h2>Create your account</h2>
        <p className="muted">Save your cart, track orders and check out faster.</p>
        {error && <div className="alert alert-err">{errMessage(error)}</div>}
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" required minLength={2} value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
          />
          <span className="muted small">At least 8 characters, with a letter and a number.</span>
        </div>
        <button className="btn btn-block" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}
