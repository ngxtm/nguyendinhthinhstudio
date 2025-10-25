import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb'
        }
    },
    eslint: {
        ignoreDuringBuilds: true
    },
    images: {
        remotePatterns: []
    },
    async rewrites() {
        if (!process.env.NEXT_PUBLIC_API_URL) {
            return []
        }

        const sanitizedBase = process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')

        return [
            {
                source: '/api/:path*',
                destination: `${sanitizedBase}/:path*`
            }
        ]
    },
    webpack(config) {
        config.resolve.alias = {
            ...config.resolve.alias,
            '@': join(__dirname, 'src')
        }

        return config
    }
}

export default nextConfig
