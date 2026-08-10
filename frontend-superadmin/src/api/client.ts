import axios from 'axios';

// MUHIM: super-admin tokeni kafe panelidan **butunlay boshqa kalit** ostida
// saqlanadi. Bitta brauzerda ikkala panel ochilsa ham tokenlar aralashmaydi,
// va kafe tokeni platforma API'sida ishlamaydi (backendda alohida JWT kalit).
export const PLATFORM_AUTH_KEY = 'cafesystem_platform_auth';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1',
});

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem(PLATFORM_AUTH_KEY);
  if (raw) {
    const { token } = JSON.parse(raw);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(PLATFORM_AUTH_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
