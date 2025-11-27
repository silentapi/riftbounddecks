import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Allow both VITE_ and REACT_APP_ prefixes so Docker build args can use either convention
  envPrefix: ['VITE_', 'REACT_APP_'],
})
