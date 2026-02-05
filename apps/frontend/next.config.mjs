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
    // Enable Turbopack (Next.js 16 default)
    turbopack: {}
}

export default nextConfig
