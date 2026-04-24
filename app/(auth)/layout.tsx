export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 px-4">
      <div className="mx-auto w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-brand">ThinkAfrika</h1>
          <p className="text-gray-500 text-sm mt-1">
            Africa&apos;s Intellectual Network
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
