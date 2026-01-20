import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
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
