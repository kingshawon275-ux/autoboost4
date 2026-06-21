import Link from "next/link";

// Explicit not-found page. Without this, Next.js 16's auto-generated
// /_not-found route can fail to emit a client reference manifest under the
// custom server (server.js), throwing "client reference manifest ... does not
// exist" at runtime. Defining it here makes the manifest generate normally.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
