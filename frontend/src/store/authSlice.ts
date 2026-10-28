import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** true once localStorage has been read, so route guards don't redirect too early */
  hydrated: boolean;
}

interface Credentials {
  user?: User;
  accessToken: string;
  refreshToken: string;
}

const initialState: AuthState = { user: null, accessToken: null, refreshToken: null, hydrated: false };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<Credentials | null>) {
      if (action.payload) {
        state.user = action.payload.user ?? null;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
      }
      state.hydrated = true;
    },
    credentialsSet(state, action: PayloadAction<Credentials>) {
      state.user = action.payload.user ?? state.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    tokensRefreshed(state, action: PayloadAction<Credentials>) {
      state.user = action.payload.user ?? state.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    loggedOut(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
    },
  },
});

export const { hydrate, credentialsSet, tokensRefreshed, loggedOut } = authSlice.actions;
export default authSlice.reducer;
