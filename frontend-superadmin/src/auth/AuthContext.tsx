import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { PLATFORM_AUTH_KEY } from '../api/client';
import type { PlatformLoginResponse } from '../api/types';

interface PlatformAuthState {
  token: string;
  admin_id: string;
  full_name: string;
  login: string;
}

interface AuthContextValue {
  auth: PlatformAuthState | null;
  setAuth: (data: PlatformLoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStoredAuth(): PlatformAuthState | null {
  const raw = localStorage.getItem(PLATFORM_AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformAuthState;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<PlatformAuthState | null>(loadStoredAuth);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      setAuth: (data) => {
        localStorage.setItem(PLATFORM_AUTH_KEY, JSON.stringify(data));
        setAuthState(data);
      },
      logout: () => {
        localStorage.removeItem(PLATFORM_AUTH_KEY);
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
