import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two pages: the site (/) and the white paper (/whitepaper/).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', whitepaper: 'whitepaper/index.html' },
    },
  },
})
