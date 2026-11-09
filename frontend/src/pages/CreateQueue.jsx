import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../layouts/AppLayout";
import { canManageQueues, createQueue } from "../services/queueService";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

const initialForm = {
  name: "",
  category: "General",
  description: "",
  ticketPrefix: "Q",
  avgServiceMinutes: "10",
};

// Mirrors the backend rules in createQueueHandler so most mistakes are caught
// before the request; the API still validates everything.
function validate(form) {
  if (!form.name.trim()) return "Queue name is required.";
  if (form.name.trim().length > 120) return "Queue name must be 120 characters or fewer.";
  if (form.category.trim().length > 60) return "Category must be 60 characters or fewer.";
  if (!/^[A-Za-z]{1,3}$/.test(form.ticketPrefix.trim())) return "Ticket prefix must be 1 to 3 letters.";

  const minutes = Number(form.avgServiceMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
    return "Average service time must be a whole number between 1 and 480 minutes.";
  }

  return "";
}

export default function CreateQueue() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { queue } = await createQueue({
        name: form.name.trim(),
        category: form.category.trim() || "General",
        description: form.description.trim() || undefined,
        ticketPrefix: form.ticketPrefix.trim().toUpperCase(),
        avgServiceMinutes: Number(form.avgServiceMinutes),
      });
      navigate(`/queues/${queue.id}/manage`);
    } catch (submitError) {
      setError(submitError.message || "Unable to create the queue.");
      setSubmitting(false);
    }
  }

  if (!canManageQueues(user)) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Staff only</h1>
          <p className="mt-2 text-sm text-slate-600">
            Only merchant and admin accounts can create queues. Ask an administrator to upgrade your account.
          </p>
          <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      <section className="mx-auto mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Staff console</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Create a queue</h1>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-medium text-slate-700">
            Queue name
            <input
              className={inputClass}
              name="name"
              value={form.name}
              onChange={handleChange}
              maxLength={120}
              placeholder="e.g. Customer service desk"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Category
            <input
              className={inputClass}
              name="category"
              value={form.category}
              onChange={handleChange}
              maxLength={60}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Description <span className="font-normal text-slate-500">(optional)</span>
            <textarea
              className={inputClass}
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Ticket prefix
              <input
                className={`${inputClass} uppercase`}
                name="ticketPrefix"
                value={form.ticketPrefix}
                onChange={handleChange}
                maxLength={3}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">Tickets look like {form.ticketPrefix.toUpperCase() || "Q"}1, {form.ticketPrefix.toUpperCase() || "Q"}2…</span>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Avg. service (min)
              <input
                className={inputClass}
                name="avgServiceMinutes"
                type="number"
                min={1}
                max={480}
                step={1}
                value={form.avgServiceMinutes}
                onChange={handleChange}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Creating..." : "Create queue"}
          </button>
        </form>
      </section>
    </AppLayout>
  );
}
