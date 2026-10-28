import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import { api } from './api';

// A factory (not a singleton) so every server render gets its own store instance.
export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
