import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">About ThinkAfrica</h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto">
          The intellectual home for Africa&apos;s next generation of thinkers, researchers, and changemakers.
        </p>
      </div>

      {/* Mission */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-3">Our Mission</h2>
        <p className="text-gray-600 leading-relaxed">
          ThinkAfrica exists to elevate student intellectual discourse across the African continent. We believe
          that Africa&apos;s brightest minds are in its universities — and their ideas deserve a platform as
          ambitious as the problems they aim to solve.
        </p>
      </section>

      {/* Vision */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-3">Our Vision</h2>
        <p className="text-gray-600 leading-relaxed">
          A continent where every student&apos;s policy idea, research finding, and original essay can reach
          policymakers, institutions, and fellow citizens — bridging the gap between campus and community.
        </p>
      </section>

      {/* The Problem */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-3">The Problem We Solve</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: "📚",
              title: "Ideas Stay on Campus",
              desc: "Brilliant student research and policy ideas rarely leave the classroom or are buried in university repositories.",
            },
            {
              icon: "🌐",
              title: "No Common Platform",
              desc: "African students lack a shared, high-quality intellectual space to publish, debate, and collaborate across borders.",
            },
            {
              icon: "🔗",
              title: "Disconnected from Decision-Makers",
              desc: "Student voices on pressing issues rarely reach the policymakers and institutions that need to hear them.",
            },
          ].map((item) => (
            <div key={item.title} className="bg-gray-50 rounded-xl p-5">
              <div className="text-2xl mb-2">{item.icon}</div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-gray-900 mb-3">The Team</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          ThinkAfrica was founded by a team of African students and professionals passionate about knowledge,
          governance, and technology. Our editors and moderators are drawn from universities across East,
          West, and Southern Africa.
        </p>
        <p className="text-sm text-gray-400">
          Want to join the team? Reach us at{" "}
          <a href="mailto:team@thinkafrica.io" className="text-emerald-brand hover:underline">
            team@thinkafrica.io
          </a>
        </p>
      </section>

      {/* CTA */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Join the Movement</h2>
        <p className="text-gray-500 text-sm mb-5">
          Add your voice to Africa&apos;s most ambitious intellectual community.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center px-6 py-2.5 bg-emerald-brand text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          Get Started — It&apos;s Free
        </Link>
      </div>
    </div>
  );
}
