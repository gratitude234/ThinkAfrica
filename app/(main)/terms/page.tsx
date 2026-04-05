export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Terms of Use</h1>
      <p className="text-gray-500 text-sm mb-8">Last updated: April 2025</p>
      <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
        <p>
          By using ThinkAfrica, you agree to these Terms of Use. Please read them carefully.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Eligibility</h2>
        <p>
          ThinkAfrica is open to students, researchers, and intellectuals with a connection to Africa.
          You must be at least 16 years old to create an account.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Content Ownership</h2>
        <p>
          You retain ownership of all content you publish on ThinkAfrica. By publishing, you grant us
          a non-exclusive licence to display, distribute, and promote your content on our platform
          and affiliated channels.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Prohibited Content</h2>
        <p>
          You may not publish plagiarised content, hate speech, personal attacks, misinformation, or
          content that violates applicable laws. Violations may result in content removal and account
          suspension.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Intellectual Property</h2>
        <p>
          The ThinkAfrica platform design, logo, and codebase are the property of ThinkAfrica. Do not
          reproduce or redistribute them without written permission.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the platform after changes
          constitutes acceptance of the new terms.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
        <p>
          Questions about these terms?{" "}
          <a href="mailto:legal@thinkafrica.io" className="text-emerald-brand hover:underline">
            legal@thinkafrica.io
          </a>
        </p>
      </div>
    </div>
  );
}
