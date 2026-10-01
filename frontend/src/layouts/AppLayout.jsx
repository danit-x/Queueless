export default function AppLayout({ children }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </main>
  );
}

