import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FEATURES = [
  { icon: "📲", text: "Customers join the queue from their phone" },
  { icon: "📣", text: "Call the next number with one tap" },
  { icon: "🔔", text: "Customers get an alert when their turn is near" },
];

// Small animated "display board" for the brand panel (decoration only).
function QueueBoard() {
  const [serving, setServing] = useState(23);

  useEffect(() => {
    const id = setInterval(() => setServing((n) => (n >= 26 ? 23 : n + 1)), 3000);
    return () => clearInterval(id);
  }, []);

  const yourNumber = 27;
  const ahead = yourNumber - serving - 1;

  return (
    <div className="ql-board" aria-hidden="true">
      <div className="ql-board-row">
        <div>
          <p className="ql-board-label">Currently serving</p>
          <p key={serving} className="ql-board-number ql-pop">
            A{serving}
          </p>
        </div>
        <div className="ql-board-ticket">
          <p className="ql-board-label">Your number</p>
          <p className="ql-board-mine">A{yourNumber}</p>
        </div>
      </div>
      <div className="ql-board-line">
        {Array.from({ length: yourNumber - serving }).map((_, i) => (
          <span key={i} className={i === 0 ? "ql-dot ql-dot-now" : "ql-dot"} />
        ))}
        <span className="ql-dot ql-dot-you" />
      </div>
      <p className={ahead <= 1 ? "ql-board-status ql-soon" : "ql-board-status"}>
        {ahead <= 1 ? "🔔 Your turn is coming soon" : `${ahead} people ahead of you`}
      </p>
    </div>
  );
}

function Logo({ light = false }) {
  return (
    <Link to="/" className={light ? "ql-logo ql-logo-light" : "ql-logo"}>
      <span className="ql-logo-mark">🕐</span>
      <span>
        Queue<strong>Less</strong>
      </span>
    </Link>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || location.state?.from || "/dashboard";

  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    if (fieldErrors[name]) setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!form.email.trim()) errors.email = "Please enter your email.";
    else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Please enter a valid email address.";
    if (!form.password) errors.password = "Please enter your password.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ql-login">
      {/* Left: brand panel (hidden on small screens) */}
      <aside className="ql-brand">
        <span className="ql-circle ql-circle-1" />
        <span className="ql-circle ql-circle-2" />

        <Logo light />

        <div className="ql-brand-body">
          <h1>
            Manage your queue,
            <br />
            not the crowd.
          </h1>
          <p className="ql-brand-text">
            For barbers, restaurants, clinics, government offices and repair shops. Your customers wait wherever they
            like – QueueLess tells them when it's their turn.
          </p>

          <QueueBoard />

          <ul className="ql-features">
            {FEATURES.map((f) => (
              <li key={f.text}>
                <span className="ql-feature-icon">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="ql-brand-footer">© {new Date().getFullYear()} QueueLess</p>
      </aside>

      {/* Right: login form */}
      <main className="ql-form-side">
        <div className="ql-form-wrap">
          <div className="ql-mobile-logo">
            <Logo />
          </div>

          <div className="ql-card">
            <h2 className="ql-title">Welcome back</h2>
            <p className="ql-subtitle">Log in to manage your QueueLess dashboard.</p>

            <form className="ql-form" onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="ql-alert" role="alert">
                  <span aria-hidden="true">⚠️</span>
                  {error}
                </div>
              )}

              <div className="ql-field">
                <label htmlFor="email">Email</label>
                <div className={fieldErrors.email ? "ql-input ql-input-error" : "ql-input"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16v12H4z M4 7l8 6 8-6" />
                  </svg>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@business.com"
                    value={form.email}
                    onChange={updateField}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    autoFocus
                  />
                </div>
                {fieldErrors.email && (
                  <p id="email-error" className="ql-field-error">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="ql-field">
                <label htmlFor="password">Password</label>
                <div className={fieldErrors.password ? "ql-input ql-input-error" : "ql-input"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={updateField}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    className="ql-toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="ql-field-error">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <button type="submit" className="ql-button" disabled={submitting}>
                {submitting && <span className="ql-spinner" aria-hidden="true" />}
                {submitting ? "Logging in..." : "Log in"}
              </button>
            </form>

            <div className="ql-divider">
              <span>or</span>
            </div>

            <Link to="/" className="ql-button-secondary">
              Join a queue without an account
            </Link>
          </div>

          <p className="ql-register">
            New to QueueLess?{" "}
            <Link to="/register">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  );
}


