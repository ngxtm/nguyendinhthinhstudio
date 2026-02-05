import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    outputFileTracingRoot: path.resolve(__dirname, '../..'),
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
        // Set root to monorepo root (absolute path)
        root: path.resolve(__dirname, '../..')
    }
}

export default nextConfig
