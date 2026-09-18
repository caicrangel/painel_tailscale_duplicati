import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Server Actions vindas do proxy da tailnet chegam com Host/Origin do IP interno.
    serverActions: { allowedOrigins: ["*"] },
  },
};

export default nextConfig;
