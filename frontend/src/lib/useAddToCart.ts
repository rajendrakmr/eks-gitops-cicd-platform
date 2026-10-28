'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAddToCartMutation } from '@/store/api';
import { useAppSelector } from '@/store/hooks';
import { errMessage } from './format';

export function useAddToCart() {
  const user = useAppSelector((s) => s.auth.user);
  const router = useRouter();
  const pathname = usePathname();
  const [addToCart, { isLoading }] = useAddToCartMutation();
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const add = useCallback(
    async (productId: string, quantity = 1) => {
      if (!user) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      try {
        await addToCart({ productId, quantity }).unwrap();
        setMessage({ type: 'ok', text: 'Added to cart' });
      } catch (e) {
        setMessage({ type: 'err', text: errMessage(e) });
      }
      setTimeout(() => setMessage(null), 2500);
    },
    [user, router, pathname, addToCart]
  );

  return { add, isLoading, message };
}
