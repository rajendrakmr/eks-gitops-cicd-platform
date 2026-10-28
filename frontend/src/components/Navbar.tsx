'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, useGetCartQuery, useLogoutMutation } from '@/store/api';
import { loggedOut } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function Navbar() {
  const { user, refreshToken, hydrated } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const { data: cart } = useGetCartQuery(undefined, { skip: !user });
  const [logoutApi] = useLogoutMutation();

  const onLogout = () => {
    if (refreshToken) logoutApi({ refreshToken });
    dispatch(loggedOut());
    dispatch(api.util.resetApiState()); // drop cached cart/orders of the previous user
    router.push('/');
  };

  const link = (href: string, label: string) => (
    <Link href={href} className={pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : ''}>
      {label}
    </Link>
  );

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">S</span> ShopStream
        </Link>
        <nav className="nav-links">
          {link('/products', 'Shop')}
          {user && link('/dashboard', 'Dashboard')}
          {user && (
            <Link href="/cart" className={pathname === '/cart' ? 'active' : ''}>
              Cart{cart && cart.itemCount > 0 ? <span className="badge-count">{cart.itemCount}</span> : null}
            </Link>
          )}
        </nav>
        <div className="nav-actions">
          {!hydrated ? null : user ? (
            <>
              <span className="muted nav-user">Hi, {user.name.split(' ')[0]}</span>
              <button className="btn btn-ghost" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/register" className="btn">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
