import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { usePolling } from "../hooks/usePolling";
import {
  POLL_INTERVAL_MS,
  callNextTicket,
  completeTicket,
  getQueue,
  getQueueTickets,
  updateQueueStatus,
} from "../services/queueService";

export default function ManageQueue() {
  const { queueId } = useParams();
  const [queue, setQueue] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [calling, setCalling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function refresh() {
    try {
      const [queueData, ticketData] = await Promise.all([
        getQueue(queueId),
        getQueueTickets(queueId),
      ]);
      setQueue(queueData.queue);
      setTickets(ticketData.tickets);
      setError("");
    } catch (error) {
      setError(error.message);
    }
  }

  usePolling(refresh, POLL_INTERVAL_MS);

  async function handleCallNext() {
    setCalling(true);
    setError("");

    try {
      const data = await callNextTicket(queueId);
      setQueue(data.queue);
      await refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setCalling(false);
    }
  }

  async function handleCompleteService() {
    if (!servingTicket) return;

    setCompleting(true);
    setError("");

    try {
      await completeTicket(servingTicket.id);
      await refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setCompleting(false);
    }
  }

  async function handleToggleQueueStatus() {
    const status = queue.status === "paused" ? "active" : "paused";
    setUpdatingStatus(true);
    setError("");

    try {
      const data = await updateQueueStatus(queueId, status);
      setQueue(data.queue);
    } catch (error) {
      setError(error.message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  const servingTicket = tickets.find((ticket) => ticket.status === "serving");
  const nextWaitingTicket = tickets.find((ticket) => ticket.status === "waiting");
  const canCallNext =
    queue?.status === "active" &&
    !servingTicket &&
    !queue?.currentServing &&
    Boolean(nextWaitingTicket);
  const canCompleteService = Boolean(servingTicket?.arrivedAt);

  return (
    <AppLayout>
      <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      <section className="mx-auto mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Staff console</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">{queue?.name ?? "Loading..."}</h1>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-left text-sm text-red-700">{error}</p>}

        {queue && (
          <>
            <p className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">Now serving</p>
            <p className="mt-1 text-7xl font-bold tracking-tight text-slate-900">{queue.currentServing ?? "—"}</p>
            {servingTicket && (
              <p className="mt-2 text-sm text-slate-600">
                Current customer: {servingTicket.code}
                {servingTicket.arrivedAt
                  ? " · arrival confirmed"
                  : " · awaiting arrival confirmation (10-minute grace period)"}
              </p>
            )}
            <p className="mt-4 text-slate-600">
              <span className="font-semibold text-slate-900">{queue.waitingCount}</span>{" "}
              {queue.waitingCount === 1 ? "person" : "people"} waiting
            </p>

            <button
              type="button"
              onClick={handleCallNext}
              disabled={calling || completing || !canCallNext}
              className="mt-8 w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {calling
                ? "Calling..."
                : !queue.currentServing && nextWaitingTicket
                  ? `Call next · ${nextWaitingTicket.code}`
                  : "Call next customer"}
            </button>
            {servingTicket && (
              <button
                type="button"
                onClick={handleCompleteService}
                disabled={completing || calling || !canCompleteService}
                className="mt-3 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {completing
                  ? "Completing service..."
                  : canCompleteService
                    ? `Complete service · ${servingTicket.code}`
                    : `Waiting for ${servingTicket.code} to arrive`}
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleQueueStatus}
              disabled={updatingStatus || queue.status === "closed"}
              className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {updatingStatus
                ? "Updating..."
                : queue.status === "paused"
                  ? "Resume queue"
                  : queue.status === "closed"
                    ? "Queue closed"
                    : "Pause queue"}
            </button>
          </>
        )}
      </section>
    </AppLayout>
  );
}
