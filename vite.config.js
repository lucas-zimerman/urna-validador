import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: o mesmo build funciona em localhost e no GitHub Pages
  // (lucas-zimerman.github.io/urna-validador/).
  base: './',
})
