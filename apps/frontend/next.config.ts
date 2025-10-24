import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [

        ],
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
            '@': resolve(__dirname, 'src')
        }

        return config
    }
}

export default nextConfig
