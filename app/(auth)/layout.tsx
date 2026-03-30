export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
      <div className="mx-auto w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-brand">ThinkAfrica</h1>
          <p className="text-gray-500 text-sm mt-1">
            Africa&apos;s Intellectual Network
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
