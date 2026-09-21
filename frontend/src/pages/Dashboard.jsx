import AppLayout from "../layouts/AppLayout";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">
          Welcome, {user?.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">QueueLess Dashboard</h1>
        <div className="mt-6 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="font-medium text-slate-700">No active queues</p>
        </div>
      </section>
    </AppLayout>
  );
}

