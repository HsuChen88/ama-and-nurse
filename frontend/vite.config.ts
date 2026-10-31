import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'serve' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '阿嬤的翻譯機',
        short_name: '阿嬤翻譯機',
        description: '台語與印尼語的手機口譯工具',
        theme_color: '#fff8e8',
        background_color: '#fff8e8',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-TW',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/join\//, /^\/cdn-cgi\//],
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
      devOptions: { enabled: true },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
}))
