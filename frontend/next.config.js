/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle: keeps the production Docker image small.
  output: 'standalone',
};

module.exports = nextConfig;
