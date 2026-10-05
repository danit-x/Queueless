import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import TurnAlert from "../components/TurnAlert";
import { usePolling } from "../hooks/usePolling";
import { getMyTickets, leaveTicket, POLL_INTERVAL_MS } from "../services/queueService";

const MAX_QUEUE_DOTS = 10;

const statusLabels = {
  waiting: { text: "Waiting", className: "bg-brand-50 text-brand-700" },
  serving: { text: "Your turn", className: "bg-emerald-50 text-emerald-700" },
  completed: { text: "Completed", className: "bg-slate-100 text-slate-700" },
  cancelled: { text: "Left queue", className: "bg-slate-100 text-slate-700" },
};

function QueueLine({ peopleAhead }) {
  const shown = Math.min(peopleAhead, MAX_QUEUE_DOTS);

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-emerald-500" title="Now serving" />
      {Array.from({ length: shown }, (_, index) => (
        <span key={index} className="h-3 w-3 rounded-full bg-slate-300" />
      ))}
      {peopleAhead > shown && <span className="text-xs text-slate-500">+{peopleAhead - shown}</span>}
      <span className="ml-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">You</span>
    </div>
  );
}

export default function Ticket() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await getMyTickets({ status: "all" });
      const currentTicket = data.tickets.find((item) => item.id === ticketId);
      if (!currentTicket) {
        setTicket(null);
        setError("Ticket not found in your ticket history.");
        return;
      }
      setTicket({
        ...currentTicket,
        status: currentTicket.status === "served" ? "completed" : currentTicket.status,
      });
      setError("");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  usePolling(refresh, POLL_INTERVAL_MS);

  async function handleLeave() {
    if (!window.confirm("Leave this queue? You'll lose your place.")) return;

    setLeaving(true);
    try {
      await leaveTicket(ticketId);
      navigate("/dashboard");
    } catch (error) {
      setError(error.message);
      setLeaving(false);
    }
  }

  if (!ticket) {
    return (
      <AppLayout>
        {loading ? (
          <p className="text-center text-slate-600" role="status">Loading ticket...</p>
        ) : error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          ← Back to dashboard
        </Link>
      </AppLayout>
    );
  }

  const status = statusLabels[ticket.status] ?? statusLabels.cancelled;
  const active = ticket.status === "waiting" || ticket.status === "serving";

  return (
    <AppLayout>
      <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mx-auto mt-4 max-w-lg space-y-4">
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {active && <TurnAlert ticket={ticket} />}

        <section className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="flex items-center justify-between text-left">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{ticket.category}</p>
              <h1 className="text-lg font-semibold text-slate-950">{ticket.queueName}</h1>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
              {status.text}
            </span>
          </div>

          <p className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">Your number</p>
          <p className="mt-1 text-7xl font-bold tracking-tight text-brand-700">{ticket.code}</p>

          <div className="mt-8 grid grid-cols-3 divide-x divide-slate-200 rounded-md border border-slate-200">
            <div className="p-3">
              <p className="text-xs text-slate-500">Now serving</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{ticket.currentServing}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-slate-500">People ahead</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{active ? ticket.peopleAhead : "—"}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-slate-500">Est. wait</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {ticket.status === "waiting" ? `~${ticket.estimatedWaitMinutes} min` : "—"}
              </p>
            </div>
          </div>

          {ticket.status === "waiting" && (
            <div className="mt-6 flex justify-center">
              <QueueLine peopleAhead={ticket.peopleAhead} />
            </div>
          )}

          {ticket.status === "completed" && (
            <p className="mt-6 text-sm text-slate-600">This ticket has been served. Thanks for using QueueLess!</p>
          )}
        </section>

        {ticket.status === "waiting" && (
          <button
            type="button"
            onClick={handleLeave}
            disabled={leaving}
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {leaving ? "Leaving..." : "Leave queue"}
          </button>
        )}
        <p className="text-center text-xs text-slate-500">This page updates automatically.</p>
      </div>
    </AppLayout>
  );
}
