import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Server-only bridge. None of these variables are injected into the client bundle.
  const env = loadEnv(mode, process.cwd(), 'GITHUB_')
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value
  return {
    plugins: [react(), {
      name: 'github-local-api',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (!request.url?.startsWith('/api/github/')) return next()
          try { await (await server.ssrLoadModule('/api/github.ts')).default(request, response) }
          catch { response.writeHead(500, { 'Cache-Control': 'no-store' }); response.end('GitHub API unavailable') }
        })
      },
    }],
  }
})
