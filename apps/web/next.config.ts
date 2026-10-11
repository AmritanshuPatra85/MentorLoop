import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mentorloop/shared"],
  async rewrites() {
    const apiUrl = process.env.API_PROXY_URL ?? "http://127.0.0.1:4000";
    return [
      { source: "/auth/:path*", destination: `${apiUrl}/auth/:path*` },
      { source: "/connections/:path*", destination: `${apiUrl}/connections/:path*` },
      { source: "/matches/:path*", destination: `${apiUrl}/matches/:path*` },
      { source: "/availability/:path*", destination: `${apiUrl}/availability/:path*` },
      { source: "/sessions-api/:path*", destination: `${apiUrl}/sessions/:path*` },
      { source: "/timeline", destination: `${apiUrl}/timeline` },
      { source: "/timeline/:path*", destination: `${apiUrl}/timeline/:path*` },
      { source: "/calendar/:path*", destination: `${apiUrl}/calendar/:path*` },
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
      { source: "/admin/feedback/:path*", destination: `${apiUrl}/admin/feedback/:path*` },
      { source: "/admin-api/users", destination: `${apiUrl}/admin/users` },
      { source: "/admin-api/analytics", destination: `${apiUrl}/admin/analytics` },
      { source: "/health", destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
