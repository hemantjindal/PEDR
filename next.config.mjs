/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  experimental: {
    // Pasted Teams exports can be large; the dump endpoint accepts up to 4MB.
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
