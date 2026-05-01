import Image from "next/image";
import Link from "next/link";

const TEAM_MEMBERS = [
  {
    name: "Oluwaferanmi Adebayo Isaac",
    role: "Founder & CEO",
    image: "/team/oluwaferanmi-adebayo.jpeg",
    responsibility:
      "The face of the organization and executive head of management.",
    accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
    paragraphs: [
      "Oluwaferanmi Adebayo founded ThinkAfrica from a conviction that Africa's intellectual community needs stronger institutional structures to nurture ideas from conception to full development. ThinkAfrica is his response to that gap: a platform designed to cultivate, refine, and advance African thought into tangible impact.",
      "He is an active student leader with a strong record of representation and advocacy across campus. His work reflects a commitment to purposeful activism, a philosophy he explores in his book, The Art of Reform: The Activism Our Nation Forgot, where he advances a model of activism grounded in strategy, discipline, and long-term societal transformation.",
      "As a certified theologian, his worldview is anchored in faith, shaping both his leadership and his vision. He sees ThinkAfrica not merely as a startup, but as a purpose-driven institution that must be nurtured with intentionality, discipline, and vision.",
    ],
  },
  {
    name: "Owolabi Malik Adebayo",
    role: "Co-Founder & COO",
    image: "/team/owolabi-malik-adebayo.jpeg",
    responsibility:
      "Operational authority responsible for the Partner Network and the coordination of Editorial, Community, Growth, and Operations.",
    accent: "bg-purple-50 text-purple-700 border-purple-100",
    paragraphs: [
      "Owolabi Malik is a Co-Founder of ThinkAfrica, driven by the belief that Africa's students have ideas worth hearing, publishing, debating, and acting on. He joined the platform to help build a credible intellectual space where university students are not limited by classroom walls, expensive journals, or lack of visibility.",
      "As a law student, Malik sees ThinkAfrica as more than an app. He sees it as a movement for student voices, intellectual growth, and Pan-African impact: a place where young African thinkers can connect across universities, challenge ideas through debates, and produce research that can influence institutions, communities, and public policy.",
      "His commitment is rooted in the belief that Africa's future will be shaped by the quality of ideas its young people are allowed to express, test, and refine.",
    ],
  },
  {
    name: "Olanibi Gratitude",
    role: "Co-Founder & CTO",
    image: "/team/olanibi-gratitude.jpeg",
    responsibility:
      "Technical authority responsible for platform architecture, engineering decisions, and product development across the ThinkAfrica ecosystem.",
    accent: "bg-amber-50 text-amber-700 border-amber-100",
    paragraphs: [
      "Gratitude is a self-taught full-stack developer and Co-Founder of ThinkAfrica, building the platform from the ground up while studying Nursing Science at Joseph Ayo Babalola University in Nigeria.",
      "His vision for ThinkAfrica has always been technical as much as intellectual: African university students deserve a platform with the credibility, depth, and design quality of established academic journals, built natively for the realities of the continent.",
      "He has independently architected and shipped the platform's core systems, from peer-review workflows and debate mechanics to AI-powered audio summaries, low-bandwidth modes, and WhatsApp-native sharing. For Gratitude, ThinkAfrica is proof that the best technology is built by people who live closest to the problem.",
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero */}
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">About ThinkAfrica</h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500">
          The intellectual home for Africa&apos;s next generation of thinkers, researchers, and changemakers.
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        {/* Mission */}
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-gray-900">Our Mission</h2>
          <p className="leading-relaxed text-gray-600">
            ThinkAfrica exists to elevate student intellectual discourse across the African continent. We believe
            that Africa&apos;s brightest minds are in its universities — and their ideas deserve a platform as
            ambitious as the problems they aim to solve.
          </p>
        </section>

        {/* Vision */}
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-gray-900">Our Vision</h2>
          <p className="leading-relaxed text-gray-600">
            A continent where every student&apos;s policy idea, research finding, and original essay can reach
            policymakers, institutions, and fellow citizens — bridging the gap between campus and community.
          </p>
        </section>
      </div>

      {/* The Problem */}
      <section className="mx-auto mb-14 max-w-3xl">
        <h2 className="mb-3 text-xl font-bold text-gray-900">The Problem We Solve</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div key={item.title} className="rounded-xl bg-canvas p-5">
              <div className="mb-2 text-2xl">{item.icon}</div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="text-xs leading-relaxed text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="mb-14">
        <div className="mx-auto mb-7 max-w-3xl text-center">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Founding team
          </p>
          <h2 className="font-display text-3xl font-semibold text-ink">
            Meet the Founding Team
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
            ThinkAfrica is being built by students and operators who believe African student ideas deserve serious infrastructure, patient leadership, and world-class execution.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {TEAM_MEMBERS.map((member) => (
            <article
              key={member.name}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-gray-100">
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover object-top"
                  priority={member.name === "Oluwaferanmi Adebayo Isaac"}
                />
              </div>
              <div className="p-5">
                <div className="mb-4">
                  <span
                    className={`mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${member.accent}`}
                  >
                    {member.role}
                  </span>
                  <h3 className="font-display text-2xl font-semibold leading-tight text-ink">
                    {member.name}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-gray-700">
                    {member.responsibility}
                  </p>
                </div>
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  {member.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-relaxed text-gray-600"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-100 bg-emerald-50 p-8 text-center">
        <h2 className="mb-2 text-xl font-bold text-gray-900">Join the Movement</h2>
        <p className="mb-5 text-sm text-gray-500">
          Add your voice to Africa&apos;s most ambitious intellectual community.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center rounded-lg bg-emerald-brand px-6 py-2.5 font-medium text-white transition-colors hover:bg-emerald-600"
        >
          Get Started — It&apos;s Free
        </Link>
      </div>
    </div>
  );
}
