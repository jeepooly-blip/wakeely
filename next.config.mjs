import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Performance ─────────────────────────────────────────────
  compress: true,                   // gzip/brotli all responses
  poweredByHeader: false,           // remove X-Powered-By header (tiny security + perf)

  // Minimize server-side bundle by marking heavy packages as external
  serverExternalPackages: ['@anthropic-ai/sdk'],

  // Optimize package imports — tree-shake icon libraries
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/ar',
        permanent: false,
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
    // Use modern format for better compression
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        // Static assets — aggressive caching
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // All pages
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          // Tell browsers to revalidate HTML but serve stale while revalidating
          { key: 'Cache-Control',             value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
