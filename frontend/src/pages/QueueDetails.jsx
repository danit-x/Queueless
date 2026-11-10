import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { getMyTickets, getQueue, joinQueue } from "../services/queueService";

const QUEUE_STATUS = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  paused: { label: "Paused", className: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
};

export default function QueueDetails() {
  const { queueId } = useParams();
  const navigate = useNavigate();
  const [queue, setQueue] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const [hasOtherActiveTicket, setHasOtherActiveTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDetails() {
      setLoading(true);
      try {
        const [queueData, ticketData] = await Promise.all([
          getQueue(queueId),
          getMyTickets({ status: "active" }),
        ]);
        if (!mounted) return;
        setQueue(queueData.queue);
        const tickets = ticketData.tickets.filter(
          (ticket) => ticket.status === "waiting" || ticket.status === "serving"
        );
        setActiveTicket(tickets.find((ticket) => ticket.queueId === queueId) ?? null);
        setHasOtherActiveTicket(tickets.some((ticket) => ticket.queueId !== queueId));
        setError("");
      } catch (loadError) {
        if (mounted) setError(loadError.message || "Unable to load this queue.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDetails();
    return () => {
      mounted = false;
    };
  }, [queueId]);

  async function handleJoinQueue() {
    setJoining(true);
    setError("");
    try {
      const { ticket } = await joinQueue(queueId);
      navigate(`/tickets/${ticket.id}`);
    } catch (joinError) {
      setError(joinError.message || "Unable to join this queue.");
      setJoining(false);
    }
  }

  const status = queue ? QUEUE_STATUS[queue.status] : null;

  return (
    <AppLayout>
      <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to services
      </Link>

      <section className="mx-auto mt-4 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {loading ? (
          <p className="text-center text-slate-600" role="status">Loading queue details...</p>
        ) : error && !queue ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
        ) : queue ? (
          <>
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-brand-700">{queue.category}</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">{queue.name}</h1>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${status?.className ?? "bg-slate-100 text-slate-600"}`}>
                {status?.label ?? queue.status}
              </span>
            </header>

            <p className="mt-3 text-slate-600">{queue.description || "Join this queue for service."}</p>

            <dl className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">People waiting</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">{queue.waitingCount}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">Average service time</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">{queue.avgServiceMinutes} min</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <dt className="text-sm text-slate-500">Estimated wait</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">~{queue.estimatedWaitMinutes} min</dd>
              </div>
            </dl>

            {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

            {activeTicket ? (
              <Link
                to={`/tickets/${activeTicket.id}`}
                className="mt-6 inline-flex w-full justify-center rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700"
              >
                View your ticket {activeTicket.code}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleJoinQueue}
                disabled={joining || queue.status !== "active" || hasOtherActiveTicket}
                className="mt-6 w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joining
                  ? "Joining..."
                  : queue.status === "active"
                    ? hasOtherActiveTicket
                      ? "Already in another queue"
                      : "Join Queue"
                    : queue.status === "paused"
                      ? "Queue temporarily paused"
                      : "Queue closed"}
              </button>
            )}
            {queue.status !== "active" && (
              <p className="mt-3 text-center text-sm text-slate-500">
                This queue is not accepting new tickets right now.
              </p>
            )}
            {hasOtherActiveTicket && (
              <p className="mt-3 text-center text-sm text-slate-500">
                You can only have one active queue ticket at a time.
              </p>
            )}
          </>
        ) : null}
      </section>
    </AppLayout>
  );
}
