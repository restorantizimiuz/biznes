import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_STORAGE_KEY } from '../api/client';
import { getMe } from '../api/endpoints';
import type { LoginResponse, PermissionKey, PermissionMap } from '../api/types';

interface AuthState {
  token: string;
  user_id: string;
  full_name: string;
  role: string;
  business_id: string;
  /** Xodimning haqiqiy vakolatlari (rol standarti + shaxsiy o'zgartirishlar). */
  permissions: PermissionMap;
}

interface AuthContextValue {
  auth: AuthState | null;
  setAuth: (data: LoginResponse) => void;
  logout: () => void;
  /** Vakolat bor-yo'qligi. Menyu, tugmalar va yo'nalishlar shunga qaraydi. */
  can: (permission: PermissionKey) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStoredAuth(): AuthState | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthState;
    // Eski sessiyalar (yangilanishdan oldin saqlangan) da permissions yo'q.
    // Bo'sh obyekt qo'yamiz — GET /me darhol to'g'ri ro'yxatni olib keladi.
    return { ...parsed, permissions: parsed.permissions ?? {} };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(loadStoredAuth);

  const persist = useCallback((state: AuthState) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
    setAuthState(state);
  }, []);

  // Sahifa ochilganda vakolatlarni serverdan qayta o'qiymiz.
  //
  // Nega kerak: vakolatlar login javobida beriladi va localStorage'da qoladi.
  // Admin xodimning ruxsatini o'zgartirsa, o'sha xodim qayta login qilmaguncha
  // eski menyuni ko'rib turardi. Bu so'rov shu farqni yopadi.
  //
  // 401 kelsa hech narsa qilmaymiz — apiClient interceptori tokeni eskirganda
  // login sahifasiga o'zi olib chiqadi.
  useEffect(() => {
    if (!auth?.token) return;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setAuthState((prev) => {
          if (!prev) return prev;
          const next = { ...prev, full_name: me.full_name, role: me.role, permissions: me.permissions };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Faqat token o'zgarganda (login/logout) qayta yuriladi.
  }, [auth?.token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      setAuth: (data) =>
        persist({
          token: data.token,
          user_id: data.user_id,
          full_name: data.full_name,
          role: data.role,
          business_id: data.business_id,
          permissions: data.permissions ?? {},
        }),
      logout: () => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthState(null);
      },
      can: (permission) => auth?.permissions?.[permission] === true,
    }),
    [auth, persist],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
