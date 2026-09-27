/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite ships WASM + data files that must be loaded from node_modules at runtime, not bundled.
    serverComponentsExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector', '@neondatabase/serverless', 'ws'],
  },
};
export default nextConfig;
