import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import QueueCard from "../components/QueueCard";
import { useAuth } from "../context/AuthContext";
import { usePolling } from "../hooks/usePolling";
import { POLL_INTERVAL_MS, canManageQueues, queueApi, usingMockApi } from "../services/queueService";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queues, setQueues] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningId, setJoiningId] = useState(null);

  async function refresh() {
    try {
      const [queueData, ticketData] = await Promise.all([queueApi.listQueues(), queueApi.myTickets()]);
      setQueues(queueData.queues);
      setTickets(ticketData.tickets);
      setError("");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  usePolling(refresh, POLL_INTERVAL_MS);

  async function handleJoin(queueId) {
    setJoiningId(queueId);
    setError("");

    try {
      const { ticket } = await queueApi.joinQueue(queueId);
      navigate(`/tickets/${ticket.id}`);
    } catch (error) {
      setError(error.message);
      setJoiningId(null);
    }
  }

  const ticketByQueue = Object.fromEntries(tickets.map((ticket) => [ticket.queueId, ticket]));
  const canManage = canManageQueues(user);

  return (
    <AppLayout>
      <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Welcome, {user?.name}</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Skip the line, not your turn</h1>
      <p className="mt-2 text-slate-600">Join a queue from anywhere and we'll tell you when it's almost your turn.</p>

      {usingMockApi && (
        <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
          Demo mode: queue data is simulated in your browser, and each queue moves forward every 20 seconds.
        </p>
      )}

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">Your tickets</h2>
        {tickets.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="font-medium text-slate-700">{loading ? "Loading..." : "You're not in any queue yet"}</p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className="flex items-center justify-between rounded-lg border border-brand-600 bg-white p-5 shadow-sm hover:bg-brand-50"
                >
                  <div>
                    <p className="text-sm text-slate-600">{ticket.queueName}</p>
                    <p className="mt-1 text-sm text-slate-900">
                      {ticket.status === "serving" ? (
                        <span className="font-semibold text-emerald-700">It's your turn!</span>
                      ) : (
                        <>
                          <span className="font-semibold">{ticket.peopleAhead}</span> ahead · now serving{" "}
                          {ticket.currentServing}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-3xl font-bold text-brand-700">{ticket.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-950">Join a queue</h2>
        {!loading && queues.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="font-medium text-slate-700">No active queues</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queues.map((queue) => (
              <QueueCard
                key={queue.id}
                queue={queue}
                activeTicket={ticketByQueue[queue.id]}
                joining={joiningId === queue.id}
                canManage={canManage}
                onJoin={handleJoin}
              />
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
