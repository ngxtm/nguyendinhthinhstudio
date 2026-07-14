import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Retained during the rollback observation window; homepage assets are local.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'imagedelivery.net'
      }
    ]
  },
  // Turbopack configuration
  turbopack: {
    // Set root to monorepo root (absolute path)
    root: path.resolve(__dirname, '../..')
  }
}

export default nextConfig
