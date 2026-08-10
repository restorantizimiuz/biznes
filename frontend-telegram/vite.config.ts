import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // .lhr.life - localhost.run orqali vaqtinchalik ochilgan tunnel domeni
    // (real Telegram WebApp sifatida sinash uchun). Productionda ishlatilmaydi.
    allowedHosts: ['.lhr.life'],
  },
})
