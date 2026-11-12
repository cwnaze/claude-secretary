// Static export: the build is plain files that `sec ui` serves from the plugin cache.
// In `next dev`, /api is proxied to a running `sec ui` (default port 7410).
const dev = process.env.NODE_ENV !== 'production';
const api = process.env.SECRETARY_API || 'http://localhost:7410';

/** @type {import('next').NextConfig} */
export default {
  output: dev ? undefined : 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  agentRules: false,
  ...(dev ? { rewrites: async () => [{ source: '/api/:path*', destination: `${api}/api/:path*` }] } : {}),
};
