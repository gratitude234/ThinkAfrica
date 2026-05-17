

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/webinars/:path*",
        destination: "/explore",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
