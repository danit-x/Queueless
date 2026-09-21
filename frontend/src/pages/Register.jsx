import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { api } from "../services/api";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      await api.register(form);
      setSuccess("Account created. Redirecting to login...");
      setTimeout(() => navigate("/login"), 900);
    } catch (error) {
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Join virtual queues without waiting in place.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Full name</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-50"
            name="name"
            value={form.name}
            onChange={updateField}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-50"
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-50"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Confirm password</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-50"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={updateField}
            required
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link className="font-medium text-brand-700 hover:underline" to="/login">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

