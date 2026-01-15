import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
