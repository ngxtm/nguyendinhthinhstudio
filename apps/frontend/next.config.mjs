import path from 'path'
import { fileURLToPath } from 'url'
import { createSeoRedirects } from './seo-routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return createSeoRedirects()
  },
  images: {
    // Retained during the rollback observation window; homepage assets are local.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'imagedelivery.net'
      }
    ],
    qualities: [75, 85]
  },
  // Turbopack configuration
  turbopack: {
    // Set root to monorepo root (absolute path)
    root: path.resolve(__dirname, '../..')
  }
}

export default nextConfig
