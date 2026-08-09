import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AUTH_STORAGE_KEY } from '../api/client';
import type { LoginResponse } from '../api/types';

interface AuthState {
  token: string;
  user_id: string;
  full_name: string;
  role: string;
  business_id: string;
}

interface AuthContextValue {
  auth: AuthState | null;
  setAuth: (data: LoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStoredAuth(): AuthState | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(loadStoredAuth);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      setAuth: (data) => {
        const state: AuthState = {
          token: data.token,
          user_id: data.user_id,
          full_name: data.full_name,
          role: data.role,
          business_id: data.business_id,
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
        setAuthState(state);
      },
      logout: () => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthState(null);
      },
    }),
    [auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
