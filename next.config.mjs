

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
      // The Responses hub was removed by the publishing reset. Responses
      // already published keep their own addresses; the hub sends readers on
      // to Explore rather than to a 404.
      {
        source: "/responses",
        destination: "/explore",
        permanent: true,
      },
      // Product families removed by the publishing reset (Phase 2D). None has
      // an equivalent to send a reader to, and old links from emails, digests
      // and search results should land somewhere useful rather than on a 404.
      ...[
        "/opportunities",
        "/fellowships",
        "/fellowships/:path*",
        "/talent",
        "/campus",
        "/ambassadors",
        "/ambassadors/:path*",
        "/alumni",
        "/policy",
      ].map((source) => ({ source, destination: "/explore", permanent: true })),
      // The partner outreach page was an institutional contact form. What is
      // left of that is the About page.
      { source: "/partners", destination: "/about", permanent: true },
      ...[
        "/admin/fellowships",
        "/admin/campuses",
        "/admin/ambassadors",
        "/admin/partners",
        "/admin/sponsors",
      ].map((source) => ({ source, destination: "/admin", permanent: true })),
      // The Featured Posts tool and the weekly digest preview went in Phase 2F,
      // with the featured lead and the curated digest they existed to serve.
      ...["/admin/review", "/admin/digest"].map((source) => ({
        source,
        destination: "/admin",
        permanent: true,
      })),
      // Admin Analytics went in the final UI simplification. The admin index
      // keeps the platform counts that are still worth a glance.
      { source: "/admin/analytics", destination: "/admin", permanent: true },
      // Direct messaging was removed in Phase 2E. An old message link lands on
      // Notifications, the nearest thing to where that activity lived.
      { source: "/messages", destination: "/notifications", permanent: true },
      { source: "/messages/:path*", destination: "/notifications", permanent: true },
      // The full Intellectual Record page went in Phase 2G. A writer's work is
      // on their profile's Posts and Articles tabs, and the query string
      // carries through, so an old ?type=posts still opens Posts.
      { source: "/:username/record", destination: "/:username", permanent: true },
      // Phase 2H removed author and topic subscriptions, the leaderboard and
      // My Stats, with points and publication delivery. Follow is the one
      // relationship left, and a writer's views and likes are on the dashboard.
      ...["/subscriptions", "/leaderboard"].map((source) => ({
        source,
        destination: "/explore",
        permanent: true,
      })),
      { source: "/stats", destination: "/dashboard", permanent: true },
      // Tracked links in publication emails and push already sent. The route
      // that resolved a token went with delivery, so the reader lands on Home.
      { source: "/r/p/:token", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
