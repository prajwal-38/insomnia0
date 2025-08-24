import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development'
  const apiUrl = process.env.VITE_API_URL || (isDevelopment ? 'http://localhost:8080' : '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    server: {
      proxy: isDevelopment ? {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        }
      } : undefined
    },
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      include: ['react', 'react-dom']
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            reactflow: ['reactflow'],
            ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
            remotion: ['@remotion/player', '@remotion/media-utils']
          }
        }
      }
    },
    esbuild: {
      logLevel: 'silent',
      legalComments: 'none',
      jsx: 'transform',
      tsconfigRaw: {
        compilerOptions: {
          skipLibCheck: true,
          strict: false
        }
      }
    },
    define: {
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_ENVIRONMENT': JSON.stringify(mode)
    }
  }
})
