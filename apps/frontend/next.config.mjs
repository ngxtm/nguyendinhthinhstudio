import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [],
  },
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      return [];
    }

    const sanitizedBase = process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${sanitizedBase}/:path*`,
      },
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(__dirname, 'src'),
    };

    return config;
  },
};

export default nextConfig;
