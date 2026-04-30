export default function EditorialStandardsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10">
        <h1 className="mb-3 text-3xl font-bold text-gray-900">Editorial Standards</h1>
        <p className="leading-relaxed text-gray-500">
          ThinkAfrica is committed to publishing high-quality, original intellectual work from
          African students. Blogs and essays move through a lighter editorial check. Research and
          policy briefs follow a formal editorial workflow with reviewer recommendations and a
          final editor decision before publication.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Content Types</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-canvas">
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Type
                </th>
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Word Count
                </th>
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Review Type
                </th>
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  type: "Blog",
                  words: "400-1,000",
                  review: "Editorial Check",
                  desc: "Opinion pieces, commentary, and personal perspectives on African issues.",
                },
                {
                  type: "Essay",
                  words: "1,000-3,000",
                  review: "Light Editorial Review",
                  desc: "Well-argued analytical essays with a clear thesis, evidence, and conclusion.",
                },
                {
                  type: "Research",
                  words: "2,000-8,000",
                  review: "Peer Review + Editor Decision",
                  desc: "Original research with methodology, findings, and citations. Reviewer recommendations inform a final editor decision.",
                },
                {
                  type: "Policy Brief",
                  words: "800-2,000",
                  review: "Reviewer Recommendation + Editor Decision",
                  desc: "Targeted recommendations for policymakers. Evidence and reviewer feedback are completed before the editor records the publication decision.",
                },
              ].map((row) => (
                <tr key={row.type} className="hover:bg-canvas">
                  <td className="border border-gray-200 px-4 py-3 font-medium text-gray-900">
                    {row.type}
                  </td>
                  <td className="border border-gray-200 px-4 py-3 text-gray-600">{row.words}</td>
                  <td className="border border-gray-200 px-4 py-3 text-gray-600">{row.review}</td>
                  <td className="border border-gray-200 px-4 py-3 text-gray-500">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Quality Standards</h2>
        <div className="space-y-3">
          {[
            {
              title: "Originality",
              desc: "All submissions must be original work not published elsewhere. Plagiarism results in permanent account suspension.",
            },
            {
              title: "Evidence and Sources",
              desc: "Claims should be supported with evidence. Research and policy briefs require structured references. Essays should cite sources where relevant.",
            },
            {
              title: "Clarity and Structure",
              desc: "Write with a clear purpose. Each piece should have an introduction, body, and conclusion appropriate to its type.",
            },
            {
              title: "African Context",
              desc: "Content should be relevant to African societies, challenges, and opportunities, whether local, national, or continental.",
            },
            {
              title: "Respectful Tone",
              desc: "We welcome bold arguments but require respectful language. Personal attacks, hate speech, and discriminatory content are prohibited.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Editorial Review Process</h2>
        <ol className="space-y-4">
          {[
            {
              step: "1",
              title: "Submit",
              desc: "The author submits through the Write page. Research and policy briefs enter the editorial queue instead of publishing immediately.",
            },
            {
              step: "2",
              title: "Reviewer Assignment",
              desc: "Editors assign the required reviewers for the submission track and wait for all assigned recommendations to be completed.",
            },
            {
              step: "3",
              title: "Editor Decision",
              desc: "Once the round is complete, the editor records one of three outcomes for reviewed submissions: accept for publication, request revision, or reject.",
            },
            {
              step: "4",
              title: "Revision Rounds",
              desc: "If revision is requested, the author submits a response note and a new version for the next editorial round.",
            },
            {
              step: "5",
              title: "Publication",
              desc: "Accepted reviewed submissions are published with an archived citation version. Blogs and essays can still publish through the lighter workflow.",
            },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="rounded-xl bg-canvas p-6 text-center">
        <h3 className="mb-1 font-semibold text-gray-900">Editorial Inquiries</h3>
        <p className="mb-2 text-sm text-gray-500">
          Questions about your submission or our standards?
        </p>
        <a
          href="mailto:editorial@thinkafrica.io"
          className="text-sm font-medium text-emerald-brand hover:underline"
        >
          editorial@thinkafrica.io
        </a>
      </div>
    </div>
  );
}
