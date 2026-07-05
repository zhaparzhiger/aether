import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint (react-hooks advisories) shouldn't fail the production build.
  // Type errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
