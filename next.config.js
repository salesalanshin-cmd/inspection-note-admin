/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // unpdf는 서버리스 번들(unpdf/pdfjs)을 포함 — webpack 번들 시 DOMMatrix polyfill 순서가 깨짐
    serverComponentsExternalPackages: ['unpdf', 'mammoth'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'unpdf', 'unpdf/pdfjs'];
    }
    return config;
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
