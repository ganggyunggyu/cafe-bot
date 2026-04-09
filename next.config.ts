import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = process.env.NEXT_DIST_DIR || '.next';

if (process.cwd() !== ROOT_DIR) {
  process.chdir(ROOT_DIR);
}

const nextConfig: NextConfig = {
  distDir: DIST_DIR,
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  turbopack: {
    root: ROOT_DIR,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(ROOT_DIR, 'node_modules'),
      ...(config.resolve.modules || []),
    ];

    return config;
  },
  async rewrites() {
    return [
      {
        source: '/queue/:path*',
        destination: 'http://localhost:3008/:path*',
      },
    ];
  },
};

export default nextConfig;
