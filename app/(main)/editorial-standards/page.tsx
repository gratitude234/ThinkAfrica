export default function EditorialStandardsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Editorial Standards</h1>
        <p className="text-gray-500 leading-relaxed">
          ThinkAfrica is committed to publishing high-quality, original intellectual work from African students.
          All submitted content is reviewed by our editorial team before publication.
        </p>
      </div>

      {/* Content types */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Content Types</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 border border-gray-200">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 border border-gray-200">Word Count</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 border border-gray-200">Review Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 border border-gray-200">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  type: "Blog",
                  words: "400–1,000",
                  review: "Editorial Review",
                  desc: "Opinion pieces, commentary, and personal perspectives on African issues.",
                },
                {
                  type: "Essay",
                  words: "1,000–3,000",
                  review: "Editorial Review",
                  desc: "Well-argued analytical essays with clear thesis, evidence, and conclusion.",
                },
                {
                  type: "Research",
                  words: "2,000–8,000",
                  review: "Peer Editorial Review",
                  desc: "Original research with methodology, findings, and citations. Abstract required.",
                },
                {
                  type: "Policy Brief",
                  words: "800–2,000",
                  review: "Editorial + Policy Review",
                  desc: "Targeted recommendations for policymakers. Problem, evidence, and recommendations required.",
                },
              ].map((row) => (
                <tr key={row.type} className="hover:bg-gray-50">
                  <td className="px-4 py-3 border border-gray-200 font-medium text-gray-900">
                    {row.type}
                  </td>
                  <td className="px-4 py-3 border border-gray-200 text-gray-600">{row.words}</td>
                  <td className="px-4 py-3 border border-gray-200 text-gray-600">{row.review}</td>
                  <td className="px-4 py-3 border border-gray-200 text-gray-500">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quality standards */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quality Standards</h2>
        <div className="space-y-3">
          {[
            {
              title: "Originality",
              desc: "All submissions must be original work not published elsewhere. Plagiarism results in permanent account suspension.",
            },
            {
              title: "Evidence & Sources",
              desc: "Claims should be supported with evidence. Research papers must include references. Essays should cite sources where relevant.",
            },
            {
              title: "Clarity & Structure",
              desc: "Write with a clear purpose. Each piece should have an introduction, body, and conclusion appropriate to its type.",
            },
            {
              title: "African Context",
              desc: "Content should be relevant to African societies, challenges, and opportunities — whether local, national, or continental.",
            },
            {
              title: "Respectful Tone",
              desc: "We welcome bold arguments but require respectful language. Personal attacks, hate speech, and discriminatory content are prohibited.",
            },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Review process */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Editorial Review Process</h2>
        <ol className="space-y-4">
          {[
            { step: "1", title: "Submit", desc: "Author submits their piece via the Write page. It enters the review queue with 'Pending' status." },
            { step: "2", title: "Initial Review", desc: "An editor checks for basic quality, originality, and adherence to word count and content type standards (within 3–5 days)." },
            { step: "3", title: "Editorial Decision", desc: "The editor approves (publishes) or rejects the piece. Authors receive a notification with the decision." },
            { step: "4", title: "Publication", desc: "Approved pieces are published immediately and visible to all users. Authors earn platform points based on content type." },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Contact */}
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <h3 className="font-semibold text-gray-900 mb-1">Editorial Inquiries</h3>
        <p className="text-sm text-gray-500 mb-2">
          Questions about your submission or our standards?
        </p>
        <a
          href="mailto:editorial@thinkafrica.io"
          className="text-sm text-emerald-brand hover:underline font-medium"
        >
          editorial@thinkafrica.io
        </a>
      </div>
    </div>
  );
}
