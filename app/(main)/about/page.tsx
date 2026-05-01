import Link from "next/link";
import AboutAnimations from "./AboutAnimations";
import AboutTeamCard, { type TeamMember } from "./AboutTeamCard";

const STATS = [
  { value: "14+", label: "Universities", target: 14, suffix: "+" },
  { value: "3", label: "Countries", target: 3 },
  { value: "200+", label: "Essays Published", target: 200, suffix: "+" },
  { value: "2024", label: "Founded" },
];

const BELIEFS = [
  {
    number: "01",
    title: "Rigour without gatekeeping",
    body: "Student work can be peer-reviewed, cited, and taken seriously without requiring a PhD or institutional affiliation.",
    accent: "border-l-emerald-brand text-emerald-700",
  },
  {
    number: "02",
    title: "Pan-African by design",
    body: "Ideas from Accra, Nairobi, Lagos, and Cape Town belong in the same conversation. Borders are not intellectual boundaries.",
    accent: "border-l-purple-accent text-purple-accent",
  },
  {
    number: "03",
    title: "Built for the continent's realities",
    body: "From low-bandwidth mode to WhatsApp-native sharing and audio summaries, we build for how Africa actually connects.",
    accent: "border-l-gold text-amber-700",
  },
];

const GAPS = [
  {
    number: "01",
    title: "Ideas stay on campus",
    body: "Brilliant student research and policy thinking is buried in university repositories or lives only in seminar rooms, seen by no one who can act on it.",
    tag: "Access gap",
    accent: "bg-emerald-brand",
    tagClass: "bg-emerald-400/15 text-emerald-200",
  },
  {
    number: "02",
    title: "No shared intellectual space",
    body: "African students lack a high-quality common platform to publish, debate, and collaborate across institutions and borders.",
    tag: "Platform gap",
    accent: "bg-purple-accent",
    tagClass: "bg-purple-400/15 text-purple-200",
  },
  {
    number: "03",
    title: "Disconnected from decision-makers",
    body: "Student voices on pressing issues rarely reach the policymakers and institutions who most need to hear them.",
    tag: "Impact gap",
    accent: "bg-gold",
    tagClass: "bg-amber-400/15 text-amber-200",
  },
];

const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Oluwaferanmi Adebayo Isaac",
    role: "Founder & CEO",
    image: "/team/oluwaferanmi-adebayo.jpeg",
    badgeClass: "bg-emerald-50 text-emerald-700",
    shortBio:
      "Founded ThinkAfrica from a conviction that Africa's intellectual community needs stronger institutional structures. A certified theologian, student leader, and author of The Art of Reform: The Activism Our Nation Forgot.",
    fullBio: [
      "Oluwaferanmi Adebayo founded ThinkAfrica from a conviction that Africa's intellectual community needs stronger institutional structures to nurture ideas from conception to full development. ThinkAfrica is his response to that gap: a platform designed to cultivate, refine, and advance African thought into tangible impact.",
      "He is an active student leader with a strong record of representation and advocacy across campus. His work reflects a commitment to purposeful activism grounded in strategy, discipline, and long-term societal transformation.",
      "As a certified theologian, his worldview is anchored in faith, shaping both his leadership and his vision. He sees ThinkAfrica not merely as a startup, but as a purpose-driven institution that must be nurtured with intentionality, discipline, and vision.",
    ],
    priority: true,
  },
  {
    name: "Owolabi Malik Adebayo",
    role: "Co-Founder & COO",
    image: "/team/owolabi-malik-adebayo.jpeg",
    badgeClass: "bg-purple-50 text-purple-700",
    shortBio:
      "Law student and Co-Founder, driven by the belief that Africa's students have ideas worth hearing, publishing, debating, and acting on. Responsible for building ThinkAfrica's credibility infrastructure across institutions.",
    fullBio: [
      "Malik sees ThinkAfrica as more than an app: a movement for student voices, intellectual growth, and Pan-African impact.",
      "He is helping build a place where young African thinkers can connect across universities, challenge ideas through debates, and produce research that can influence institutions, communities, and public policy.",
      "His commitment is rooted in the belief that Africa's future will be shaped by the quality of ideas its young people are allowed to express, test, and refine.",
    ],
  },
  {
    name: "Olanibi Gratitude",
    role: "Co-Founder & CTO",
    image: "/team/olanibi-gratitude.jpeg",
    badgeClass: "bg-amber-50 text-amber-700",
    shortBio:
      "Self-taught full-stack developer building ThinkAfrica from the ground up while studying at JABU, Nigeria. Ships peer-review workflows, debate mechanics, AI audio summaries, and low-bandwidth modes.",
    fullBio: [
      "His vision for ThinkAfrica has always been technical as much as intellectual: African university students deserve a platform with the credibility, depth, and design quality of established academic journals, built natively for the realities of the continent.",
      "He has independently architected and shipped the platform's core systems, from peer-review workflows and debate mechanics to AI-powered audio summaries, low-bandwidth modes, and WhatsApp-native sharing.",
      "For Gratitude, ThinkAfrica is proof that the best technology is built by people who live closest to the problem.",
    ],
  },
];

function Eyebrow({
  children,
  centered = false,
  reveal,
  delay,
}: {
  children: React.ReactNode;
  centered?: boolean;
  reveal?: "up" | "fade";
  delay?: number;
}) {
  return (
    <p
      data-about-reveal={reveal}
      data-about-delay={delay}
      className={`mb-5 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 ${
        centered ? "justify-center" : ""
      }`}
    >
      {centered ? <span className="h-px w-7 bg-emerald-brand" /> : null}
      {children}
      <span className={centered ? "h-px w-7 bg-emerald-brand" : "h-px w-14 bg-emerald-brand"} />
    </p>
  );
}

export default function AboutPage() {
  return (
    <div className="about-page mx-auto max-w-[960px] text-ink">
      <AboutAnimations />
      <section className="relative overflow-hidden border-b border-[#e5e0d8] px-2 py-14 text-center sm:py-16">
        <div
          className="about-dot-grid pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(16,185,129,0.13) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)",
          }}
        />
        <div className="relative">
          <Eyebrow centered reveal="up">
            About ThinkAfrica
          </Eyebrow>
          <h1
            data-about-reveal="up"
            data-about-delay="1"
            className="mx-auto max-w-[740px] font-display text-[40px] font-bold leading-[1.08] tracking-tight text-ink sm:text-[56px] lg:text-[64px]"
          >
            Where African student ideas <em className="text-emerald-700">become </em>
            the record
          </h1>
          <p
            data-about-reveal="up"
            data-about-delay="2"
            className="mx-auto mt-5 max-w-[520px] text-base leading-[1.75] text-ink-muted"
          >
            A platform built on the conviction that Africa&apos;s most important
            thinking is happening on its campuses, and it deserves to be heard
            far beyond them.
          </p>

          <div
            data-about-reveal="up"
            data-about-delay="3"
            className="mx-auto mt-10 grid max-w-[640px] grid-cols-2 border-y border-[#e5e0d8] sm:grid-cols-4 sm:border-y-0"
          >
            {STATS.map((stat, index) => (
              <div
                key={stat.label}
                className={`px-3 py-5 text-center ${
                  index > 0 ? "sm:border-l sm:border-[#e5e0d8]" : ""
                } ${index < 2 ? "border-b border-[#e5e0d8] sm:border-b-0" : ""}`}
              >
                <span
                  data-about-stat-target={stat.target}
                  data-about-stat-suffix={stat.suffix}
                  className="block font-display text-3xl font-bold leading-none text-ink"
                >
                  {stat.value}
                </span>
                <span className="mt-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#e5e0d8] py-16">
        <Eyebrow reveal="fade">Why we exist</Eyebrow>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div data-about-reveal="left">
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[34px]">
              A different kind of intellectual infrastructure
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-[1.8] text-ink-muted">
              <p>
                Africa&apos;s most pressing problems, from governance to climate
                to economic design, are being studied, debated, and partially
                solved in university seminar rooms and student dormitories. But
                almost none of it reaches the people who need it.
              </p>
              <p>
                ThinkAfrica was founded to fix that. Not as a blog, not as a
                social feed, but as a serious publishing and intellectual
                community built natively for African students, in African
                contexts, with African ambition.
              </p>
            </div>

            <blockquote
              data-about-reveal="up"
              data-about-delay="2"
              className="mt-8 rounded-b-xl border border-[#e5e0d8] border-t-4 border-t-emerald-brand bg-white px-7 py-6"
            >
              <span className="block font-display text-7xl font-bold leading-[0.65] text-emerald-brand/20">
                &quot;
              </span>
              <p className="font-display text-[17px] italic leading-[1.65] text-ink">
                Africa&apos;s future will be shaped by the quality of ideas its
                young people are allowed to express, test, and refine.
              </p>
            </blockquote>
          </div>

          <div className="space-y-3.5">
            {BELIEFS.map((belief) => (
              <article
                key={belief.title}
                data-about-reveal="right"
                data-about-delay={belief.number}
                className={`grid grid-cols-[36px_1fr] gap-4 rounded-xl border border-[#e5e0d8] border-l-[3px] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] ${belief.accent}`}
              >
                <span className="pt-0.5 font-display text-sm font-bold">
                  {belief.number}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {belief.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-[1.65] text-ink-muted">
                    {belief.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative left-1/2 w-[calc(100vw-16px)] -translate-x-1/2 bg-ink py-16 text-white">
        <div className="mx-auto max-w-[960px] px-5">
          <Eyebrow reveal="fade">The problem we solve</Eyebrow>
          <h2
            data-about-reveal="up"
            data-about-delay="1"
            className="max-w-[520px] font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-[34px]"
          >
            Three gaps we were built to close
          </h2>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:grid-cols-3">
            {GAPS.map((gap) => (
              <article
                key={gap.title}
                data-about-reveal="up"
                data-about-delay={gap.number}
                className="about-gap-card relative min-h-[270px] overflow-hidden bg-white/[0.04] p-7 transition hover:bg-white/[0.06]"
              >
                <span
                  className={`about-gap-accent absolute inset-x-0 top-0 h-[3px] ${gap.accent}`}
                />
                <span className="pointer-events-none absolute bottom-3 right-4 font-display text-7xl font-bold leading-none text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.08)]">
                  {gap.number}
                </span>
                <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-display text-sm font-bold text-white">
                  {gap.number}
                </div>
                <h3 className="text-[15px] font-semibold text-white">
                  {gap.title}
                </h3>
                <p className="mt-3 text-[13px] leading-[1.7] text-white/55">
                  {gap.body}
                </p>
                <span
                  className={`mt-5 inline-flex rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${gap.tagClass}`}
                >
                  {gap.tag}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#e5e0d8] py-16">
        <div className="mb-10 max-w-[540px]" data-about-reveal="up">
          <Eyebrow>The founding team</Eyebrow>
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-[34px]">
            Built by students, for students
          </h2>
          <p className="mt-3 text-[15px] leading-[1.75] text-ink-muted">
            ThinkAfrica is led by students and operators who believe African
            student ideas deserve serious infrastructure, patient leadership,
            and world-class execution.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {TEAM_MEMBERS.map((member, index) => (
            <AboutTeamCard
              key={member.name}
              member={member}
              revealDelay={index + 1}
            />
          ))}
        </div>
      </section>

      <section className="relative left-1/2 w-[calc(100vw-16px)] -translate-x-1/2 border-y border-[#e5e0d8] bg-[#f4f2ee] py-12">
        <div
          data-about-reveal="up"
          className="mx-auto grid max-w-[960px] items-center gap-6 px-5 lg:grid-cols-[1fr_auto] lg:gap-12"
        >
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
              Become a campus ambassador
            </h2>
            <p className="mt-2 max-w-[520px] text-sm leading-[1.7] text-ink-muted">
              Help ThinkAfrica grow at your university. Represent your
              institution&apos;s intellectual community, recruit contributors,
              and bring your campus into the network.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/ambassadors/apply"
              className="inline-flex rounded-lg border border-emerald-brand px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Apply Now
            </Link>
            <Link
              href="/ambassadors"
              className="inline-flex rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:opacity-85"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div
          data-about-reveal="scale"
          className="relative overflow-hidden rounded-[20px] bg-ink px-7 py-12 text-center text-white sm:px-14 sm:py-16"
        >
          <div className="about-cta-orb-a pointer-events-none absolute -left-16 top-1/2 hidden h-72 w-80 -translate-y-1/2 rounded-full bg-emerald-brand/20 blur-3xl sm:block" />
          <div className="about-cta-orb-b pointer-events-none absolute -right-10 top-1/2 hidden h-64 w-72 -translate-y-1/2 rounded-full bg-purple-accent/15 blur-3xl sm:block" />
          <div className="relative">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-brand">
              Join the community
            </p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-[42px]">
              Ready to add your voice
              <br />
              to <em className="text-emerald-brand">the record?</em>
            </h2>
            <p className="mx-auto mt-4 max-w-[460px] text-[15px] leading-[1.7] text-white/60">
              Join Africa&apos;s most ambitious intellectual community. Read,
              write, debate. Free for all students.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/write"
                className="inline-flex rounded-[10px] bg-emerald-brand px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Start Writing
              </Link>
              <Link
                href="/?guest=1"
                className="inline-flex rounded-[10px] border border-white/15 bg-white/10 px-8 py-3.5 text-sm font-medium text-white/85 transition hover:bg-white/15"
              >
                Explore Essays
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
