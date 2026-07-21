// Next.js resolves the real `server-only` package to a no-op under its
// "react-server" bundler condition; plain Vitest doesn't apply that
// condition, so the real package's default export throws unconditionally.
// This shim stands in for it in tests so modules marked `server-only` can
// still be imported (and their actual logic exercised) outside Next's
// build -- it intentionally does nothing.
export {};
