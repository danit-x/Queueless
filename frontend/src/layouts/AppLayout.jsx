import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AppLayout({ children }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="text-xl font-bold text-brand-700">
            QueueLess
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </main>
  );
}

