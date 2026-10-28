import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { credentialsSet, loggedOut, tokensRefreshed } from './authSlice';
import type { AuthState, User } from './authSlice';

// ---------------------------------------------------------------- types
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  stock: number;
  rating: number;
  createdAt: string;
}
export interface ProductInput {
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  stock: number;
}
export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
export interface ProductQuery {
  search?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}
export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
}
export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  createdAt: string;
  items: CartItem[];
}
export interface Stats {
  scope: 'global' | 'user';
  orders: number;
  revenue: number;
  byStatus: Record<string, number>;
  daily: { date: string; orders: number; revenue: number }[];
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;

// ---------------------------------------------------------------- base query with silent token refresh
// Typed against a minimal state shape (not RootState) to avoid a circular type dependency with the store.
type StateWithAuth = { auth: AuthState };

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as StateWithAuth).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// Shared so that a burst of concurrent 401s triggers exactly one refresh request.
let refreshPromise: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;

  // Login/register failures are legitimate 401s, never try to refresh for /auth/* calls.
  if (result.error?.status === 401 && !url.startsWith('/auth/')) {
    const { refreshToken } = (api.getState() as StateWithAuth).auth;
    if (!refreshToken) {
      api.dispatch(loggedOut());
      return result;
    }
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const res = await rawBaseQuery({ url: '/auth/refresh', method: 'POST', body: { refreshToken } }, api, extra);
        if (res.data) {
          api.dispatch(tokensRefreshed(res.data as AuthResponse));
          return true;
        }
        api.dispatch(loggedOut());
        return false;
      })().finally(() => {
        refreshPromise = null;
      });
    }
    if (await refreshPromise) result = await rawBaseQuery(args, api, extra);
  }
  return result;
};

const clean = <T extends object>(obj?: T | void) =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== null));

// ---------------------------------------------------------------- API
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Product', 'Cart', 'Order', 'Stats'],
  endpoints: (build) => ({
    // ---- auth
    login: build.mutation<AuthResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(credentialsSet(data));
        } catch {
          /* surfaced by the component through the mutation result */
        }
      },
    }),
    register: build.mutation<AuthResponse, { name: string; email: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(credentialsSet(data));
        } catch {
          /* surfaced by the component */
        }
      },
    }),
    logout: build.mutation<void, { refreshToken: string }>({
      query: (body) => ({ url: '/auth/logout', method: 'POST', body }),
    }),

    // ---- catalog
    getProducts: build.query<ProductList, ProductQuery | void>({
      query: (q) => ({ url: '/products', params: clean(q) }),
      providesTags: (res) => [
        { type: 'Product', id: 'LIST' },
        ...(res?.items ?? []).map(({ id }) => ({ type: 'Product' as const, id })),
      ],
    }),
    getProduct: build.query<Product, string>({
      query: (id) => `/products/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Product', id }],
    }),
    getCategories: build.query<string[], void>({
      query: () => '/categories',
      providesTags: [{ type: 'Product', id: 'LIST' }],
    }),
    createProduct: build.mutation<Product, ProductInput>({
      query: (body) => ({ url: '/products', method: 'POST', body }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }],
    }),
    updateProduct: build.mutation<Product, { id: string } & ProductInput>({
      query: ({ id, ...body }) => ({ url: `/products/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Product', id }, { type: 'Product', id: 'LIST' }],
    }),
    deleteProduct: build.mutation<void, string>({
      query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }],
    }),

    // ---- cart
    getCart: build.query<Cart, void>({ query: () => '/cart', providesTags: ['Cart'] }),
    addToCart: build.mutation<Cart, { productId: string; quantity: number }>({
      query: (body) => ({ url: '/cart/items', method: 'POST', body }),
      invalidatesTags: ['Cart'],
    }),
    updateCartItem: build.mutation<Cart, { productId: string; quantity: number }>({
      query: ({ productId, quantity }) => ({ url: `/cart/items/${productId}`, method: 'PATCH', body: { quantity } }),
      invalidatesTags: ['Cart'],
    }),
    removeCartItem: build.mutation<Cart, string>({
      query: (productId) => ({ url: `/cart/items/${productId}`, method: 'DELETE' }),
      invalidatesTags: ['Cart'],
    }),

    // ---- orders
    checkout: build.mutation<Order, void>({
      query: () => ({ url: '/orders', method: 'POST' }),
      // Stock changed, so catalog data is stale too.
      invalidatesTags: ['Cart', 'Order', 'Stats', { type: 'Product', id: 'LIST' }],
    }),
    getOrders: build.query<Order[], { all?: boolean } | void>({
      query: (q) => ({ url: '/orders', params: clean(q) }),
      providesTags: ['Order'],
    }),
    updateOrderStatus: build.mutation<Order, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Order', 'Stats'],
    }),
    getStats: build.query<Stats, void>({ query: () => '/orders/stats', providesTags: ['Stats'] }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetProductsQuery,
  useGetProductQuery,
  useGetCategoriesQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useGetCartQuery,
  useAddToCartMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useCheckoutMutation,
  useGetOrdersQuery,
  useUpdateOrderStatusMutation,
  useGetStatsQuery,
} = api;
