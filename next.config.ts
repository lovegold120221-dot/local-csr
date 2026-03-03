import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Increase payload size limit for audio uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: '/api/:path*' }];
  },
};

export default nextConfig;
