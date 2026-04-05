import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8">
          <span className="text-2xl font-bold text-emerald-brand">ThinkAfrica</span>
        </Link>

        <div className="text-7xl font-black text-gray-200 mb-4 select-none">404</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          This page doesn&apos;t exist — but your ideas do.
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          The page you&apos;re looking for may have moved or never existed. Head back to explore what&apos;s happening on ThinkAfrica.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-5 py-2.5 bg-emerald-brand text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors text-sm"
          >
            Explore the Feed
          </Link>
          <Link
            href="/debates"
            className="px-5 py-2.5 bg-white text-gray-700 border border-gray-200 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Join a Debate
          </Link>
        </div>
      </div>
    </div>
  );
}
