import apiClient from './client';
import type {
  Business,
  CreateBusinessBody,
  PlatformAuditResponse,
  PlatformLoginResponse,
  PlatformStats,
  PlatformUsersResponse,
  SubscriptionPlan,
} from './types';

export const platformLogin = (login: string, password: string) =>
  apiClient
    .post<PlatformLoginResponse>('/platform/login', { login, password })
    .then((r) => r.data);

export const getStats = () =>
  apiClient.get<PlatformStats>('/platform/stats').then((r) => r.data);

export const listBusinesses = () =>
  apiClient.get<Business[]>('/platform/businesses').then((r) => r.data ?? []);

export const createBusiness = (body: CreateBusinessBody) =>
  apiClient.post('/platform/businesses', body).then((r) => r.data);

export const updateBusiness = (
  id: string,
  body: {
    name?: string;
    phone?: string;
    is_active?: boolean;
    max_tables?: number;
    max_waiters?: number;
    max_cashiers?: number;
  },
) => apiClient.patch(`/platform/businesses/${id}`, body).then((r) => r.data);

export const setSubscription = (
  id: string,
  body: { plan: SubscriptionPlan; status: string; duration_days: number },
) => apiClient.post(`/platform/businesses/${id}/subscription`, body).then((r) => r.data);

export const setFeature = (id: string, feature_key: string, is_enabled: boolean) =>
  apiClient
    .post(`/platform/businesses/${id}/features`, { feature_key, is_enabled })
    .then((r) => r.data);

export interface PlatformListParams {
  business_id?: string;
  role?: string;
  status?: 'active' | 'inactive';
  limit?: number;
  offset?: number;
}

export const listPlatformUsers = (params: PlatformListParams = {}) =>
  apiClient
    .get<PlatformUsersResponse>('/platform/users', { params })
    .then((r) => r.data);

export const listPlatformStaff = (params: PlatformListParams = {}) =>
  apiClient
    .get<PlatformUsersResponse>('/platform/staff', { params })
    .then((r) => r.data);

export interface CredentialUpdateBody {
  new_login?: string;
  new_password?: string;
  new_password_confirm?: string;
}

// Super-admin o'zining login/parolini o'zgartiradi — joriy parol talab qilinadi.
export const updateMe = (body: CredentialUpdateBody & { current_password: string }) =>
  apiClient.patch<{ message: string; login: string }>('/platform/me', body).then((r) => r.data);

// Super-admin tanlangan kafening bitta xodimi/egasi uchun login/parolni
// almashtiradi — joriy parol shart emas (superadmin xodimning parolini
// bilmaydi, faqat reset qiladi).
export const updateStaffCredentials = (
  businessId: string,
  userId: string,
  body: CredentialUpdateBody,
) =>
  apiClient
    .patch<{ message: string; login: string }>(
      `/platform/businesses/${businessId}/staff/${userId}`,
      body,
    )
    .then((r) => r.data);

export const listPlatformAuditLogs = (
  params: { business_id?: string; action?: string; limit?: number; offset?: number } = {},
) =>
  apiClient
    .get<PlatformAuditResponse>('/platform/audit-logs', { params })
    .then((r) => r.data);
