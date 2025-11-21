import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite automatically exposes VITE_ prefixed env vars to the client
  // Default to 'test' if not set, can be overridden by build command
  envPrefix: 'VITE_',
})
