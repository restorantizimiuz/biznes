import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Super-admin paneli **alohida ilova** va alohida portda ishlaydi.
// Kafe paneli 5173, Telegram WebApp 5174, super-admin 5175.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
  },
})
