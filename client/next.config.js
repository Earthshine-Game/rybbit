/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@rybbit/shared"],
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_DISABLE_SIGNUP: process.env.NEXT_PUBLIC_DISABLE_SIGNUP,
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
