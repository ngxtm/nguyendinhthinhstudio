/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'imagedelivery.net'
            }
        ]
    },
    // Turbopack configuration
    turbopack: {
        // Set root to monorepo root to silence lockfile warning
        root: '../..'
    }
}

export default nextConfig
