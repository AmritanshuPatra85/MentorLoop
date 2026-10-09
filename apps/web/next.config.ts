import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mentorloop/shared"],
  async rewrites() {
    const apiUrl = process.env.API_PROXY_URL ?? "http://127.0.0.1:4000";
    return [
      { source: "/auth/:path*", destination: `${apiUrl}/auth/:path*` },
      { source: "/taxonomy/:path*", destination: `${apiUrl}/taxonomy/:path*` },
      { source: "/profiles/:path*", destination: `${apiUrl}/profiles/:path*` },
      {
        source: "/uploads/avatars/:path*",
        destination: `${apiUrl}/uploads/avatars/:path*`,
      },
      {
        source: "/founder-onboarding/:path*",
        destination: `${apiUrl}/founder-onboarding/:path*`,
      },
      {
        source: "/mentor-onboarding/:path*",
        destination: `${apiUrl}/mentor-onboarding/:path*`,
      },
      {
        source: "/admin/mentor-approvals/:path*",
        destination: `${apiUrl}/admin/mentor-approvals/:path*`,
      },
      { source: "/health", destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
