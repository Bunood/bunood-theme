import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    frappeui({
      frappeProxy: true,
      jinjaBootData: true,
      buildConfig: {
        outDir: '../zerone_hr/public/frontend',
        indexHtmlPath: '../zerone_hr/www/people.html',
        baseUrl: '/assets/zerone_hr/frontend/',
      },
    }),
    vue(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
