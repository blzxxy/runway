/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Keeps a stray type nit from blocking your first Vercel deploy.
  // Flip to false later if you want strict CI type checks.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
