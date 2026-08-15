import { CONTACT_EMAILS } from "@/lib/site";

export default function EditorialStandardsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10">
        <h1 className="mb-3 text-3xl font-bold text-gray-900">Editorial Standards</h1>
        <p className="leading-relaxed text-gray-500">
          Indegenius is committed to publishing high-quality, original intellectual work from
          African students and emerging thinkers. Posts and Articles publish directly. Research
          follows a formal editorial workflow with reviewer recommendations and a final editor
          decision before publication.
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
                  Core requirements
                </th>
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Publication path
                </th>
                <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  type: "Post",
                  requirements: "Body up to 2,000 characters; title optional",
                  publication: "Publishes directly",
                  desc: "A lightweight idea, observation, question, or conversational contribution.",
                },
                {
                  type: "Article",
                  requirements: "Title and long-form rich text",
                  publication: "Publishes directly",
                  desc: "Long-form argument, analysis, or commentary. Essay and Policy Brief are optional genres, not review claims.",
                },
                {
                  type: "Research",
                  requirements: "PDF, title, abstract, keywords, authors, and references",
                  publication: "Formal editorial review",
                  desc: "A research-paper record that becomes reviewed and citable only after an editor accepts it.",
                },
              ].map((row) => (
                <tr key={row.type} className="hover:bg-canvas">
                  <td className="border border-gray-200 px-4 py-3 font-medium text-gray-900">
                    {row.type}
                  </td>
                  <td className="border border-gray-200 px-4 py-3 text-gray-600">
                    {row.requirements}
                  </td>
                  <td className="border border-gray-200 px-4 py-3 text-gray-600">
                    {row.publication}
                  </td>
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
              desc: "Claims should be supported with evidence. Research requires structured references; Articles should cite sources where relevant.",
            },
            {
              title: "Clarity and Structure",
              desc: "Write with a clear purpose. Each piece should have an introduction, body, and conclusion appropriate to its type.",
            },
            {
              title: "Context and Relevance",
              desc: "Work may address African or global subjects. Authors should make the relevant context, evidence, and affected communities clear.",
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
              title: "Submit Research",
              desc: "The author submits a Research paper through the dedicated Research flow. It enters the editorial queue instead of publishing immediately.",
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
              desc: "Accepted Research is published with an archived citation version. Posts and Articles publish directly and do not become reviewed or citable because of their type or genre.",
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
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Indegenius currently calls this process formal editorial review, not peer review.
          “Peer Reviewed” will be used only if a separate, rigorous peer-review system is
          implemented and verified. Older Policy Brief submissions that entered review before the
          current content model may complete that legacy workflow; new Policy Briefs are Article
          genres and publish directly.
        </div>
      </section>

      <div className="rounded-xl bg-canvas p-6 text-center">
        <h3 className="mb-1 font-semibold text-gray-900">Editorial Inquiries</h3>
        <p className="mb-2 text-sm text-gray-500">
          Questions about your submission or our standards?
        </p>
        {/* TODO(gratitude): confirm production domain — this mailbox is a placeholder until then. */}
        <a
          href={`mailto:${CONTACT_EMAILS.editorial}`}
          className="text-sm font-medium text-emerald-brand hover:underline"
        >
          {CONTACT_EMAILS.editorial}
        </a>
      </div>
    </div>
  );
}
