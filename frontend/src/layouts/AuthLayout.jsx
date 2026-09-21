import { Link } from "react-router-dom";

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="text-xl font-bold text-brand-700">
          QueueLess
        </Link>
      </nav>
      <section className="mx-auto flex max-w-6xl items-center justify-center px-5 py-8">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

