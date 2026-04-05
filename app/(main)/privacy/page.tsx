export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
      <p className="text-gray-500 text-sm mb-8">Last updated: April 2025</p>
      <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
        <p>
          ThinkAfrica (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy
          explains how we collect, use, and safeguard your information when you use our platform.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Information We Collect</h2>
        <p>
          We collect information you provide directly (name, email, university, bio) when you create an
          account or publish content. We also collect usage data such as pages visited and content
          interactions to improve our platform.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">How We Use Your Information</h2>
        <p>
          Your information is used to operate the platform, personalise your experience, send
          notifications about platform activity, and improve our services. We do not sell your
          personal data to third parties.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Data Storage</h2>
        <p>
          Your data is stored securely using Supabase infrastructure with encryption at rest and in
          transit. We retain your data for as long as your account is active.
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
        <p>
          For privacy-related inquiries, contact us at{" "}
          <a href="mailto:privacy@thinkafrica.io" className="text-emerald-brand hover:underline">
            privacy@thinkafrica.io
          </a>
        </p>
      </div>
    </div>
  );
}
