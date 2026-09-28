import { Link } from "react-router-dom";

export default function QueueCard({ queue, activeTicket, joining, canManage, onJoin }) {
  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="w-fit rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
        {queue.category}
      </span>
      <h3 className="mt-3 text-lg font-semibold text-slate-950">{queue.name}</h3>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Serving</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{queue.currentServing ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Waiting</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{queue.waitingCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Est. wait</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">~{queue.estimatedWaitMinutes} min</dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center gap-3 pt-1">
        {activeTicket ? (
          <Link
            to={`/tickets/${activeTicket.id}`}
            className="flex-1 rounded-md border border-brand-600 px-4 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            View ticket {activeTicket.code}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onJoin(queue.id)}
            disabled={joining}
            className="flex-1 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {joining ? "Joining..." : "Join queue"}
          </button>
        )}
        {canManage && (
          <Link
            to={`/queues/${queue.id}/manage`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            Staff view
          </Link>
        )}
      </div>
    </article>
  );
}
