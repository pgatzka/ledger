/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle under .next/standalone for a slim
  // Docker runtime image.
  output: "standalone",
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

module.exports = nextConfig;
