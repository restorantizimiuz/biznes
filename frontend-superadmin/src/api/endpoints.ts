import apiClient from './client';
import type {
  Business,
  CreateBusinessBody,
  PlatformLoginResponse,
  PlatformStats,
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
