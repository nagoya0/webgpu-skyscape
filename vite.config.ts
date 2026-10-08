import { defineConfig } from 'vite'

export default defineConfig({
  // Relative, so that the build works wherever it is served: under /webgpu-skyscape/ on GitHub
  // Pages, or at the root. The assets are loaded relative to the page (import.meta.env.BASE_URL).
  base: './'
})
