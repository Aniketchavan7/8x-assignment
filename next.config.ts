import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Suppress Node.js --localstorage-file warning during build
// This warning appears when Next.js spawns worker processes with the experimental flag
if (typeof process !== 'undefined') {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...args: any[]) {
    if (typeof warning === 'string' && warning.includes('--localstorage-file')) {
      return; // Suppress this specific warning
    }
    if (warning instanceof Error && warning.message.includes('--localstorage-file')) {
      return; // Suppress this specific warning
    }
    return (originalEmitWarning as any).apply(process, [warning, ...args]);
  };

  // Also intercept warnings written directly to stderr
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function (chunk: string | Uint8Array, ...args: any[]) {
    const message = typeof chunk === 'string' ? chunk : chunk.toString();
    if (message.includes('--localstorage-file')) {
      return true; // Suppress by returning true (success) without writing
    }
    return (originalStderrWrite as any).apply(process.stderr, [chunk, ...args]);
  };
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  // Note: cacheComponents (PPR replacement) disabled due to incompatibility with
  // route segment configs (dynamic/runtime) used in API routes.
  // The CVE-2025-55182 security fix is still active in Next.js 16.0.7.
  compiler: {
    // Strip console.log from production bundles, but keep error/warn/info
    // Use console.info in API routes for logs you want to see in production
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn', 'info'] } : false,
  },
  typescript: {
    // Don't fail build on type errors during build
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: [
        'app.8x.social',
        'app-staging.8x.social',
        'www.8x.social',
      ],
    },
    optimizePackageImports: ['lucide-react', '@/components/Admin/AdminGrid'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54421',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Allow any Supabase URL (for different regions)
      {
        protocol: 'https',
        hostname: '*.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
      // TikTok CDN domains for thumbnails
      {
        protocol: 'https',
        hostname: '*.tiktokcdn-us.com',
      },
      {
        protocol: 'https',
        hostname: '*.tiktokcdn.com',
      },
      // Instagram CDN domains for thumbnails
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: 'scontent-*.cdninstagram.com',
      },
      // DiceBear avatar API for placeholder images
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/ph/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ph/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ];
  },
};

const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: '8x',

  project: 'platform',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Delete source maps after uploading to Sentry
  // This keeps them available for debugging in Sentry but not exposed to users
  sourcemaps: {
    disable: !isProduction,
    deleteSourcemapsAfterUpload: true,
  },

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
