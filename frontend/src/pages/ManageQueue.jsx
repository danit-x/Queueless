import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { usePolling } from "../hooks/usePolling";
import {
  POLL_INTERVAL_MS,
  callNextTicket,
  getQueue,
  updateQueueStatus,
} from "../services/queueService";

export default function ManageQueue() {
  const { queueId } = useParams();
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [calling, setCalling] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function refresh() {
    try {
      const data = await getQueue(queueId);
      setQueue(data.queue);
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
    } catch (error) {
      setError(error.message);
    } finally {
      setCalling(false);
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
            <p className="mt-4 text-slate-600">
              <span className="font-semibold text-slate-900">{queue.waitingCount}</span>{" "}
              {queue.waitingCount === 1 ? "person" : "people"} waiting
            </p>

            <button
              type="button"
              onClick={handleCallNext}
              disabled={calling || queue.waitingCount === 0}
              className="mt-8 w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {calling ? "Calling..." : "Call next customer"}
            </button>
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
