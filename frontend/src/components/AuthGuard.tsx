'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';

export default function AuthGuard({ children, role }: { children: React.ReactNode; role?: 'admin' }) {
  const { user, hydrated } = useAppSelector((s) => s.auth);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, user, router, pathname]);

  if (!hydrated || !user) return <div className="container page-state">Loading…</div>;

  if (role && user.role !== role) {
    return (
      <div className="container page-state">
        <h2>Access denied</h2>
        <p className="muted">You need {role} permissions to view this page.</p>
        <Link href="/dashboard" className="btn">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
