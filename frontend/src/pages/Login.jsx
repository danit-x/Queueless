import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YOUR_NUMBER = 27;

const PLACES = [
  { icon: "💈", label: "Barber" },
  { icon: "🍽️", label: "Restaurant" },
  { icon: "🩺", label: "Clinic" },
  { icon: "🏛️", label: "Gov. office" },
  { icon: "🔧", label: "Repair shop" },
];

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9" />
      <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 6 10 6a10 10 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

// Left-side scene: a phone showing a live QueueLess ticket (decoration only).
function QueueScene() {
  const [serving, setServing] = useState(23);

  useEffect(() => {
    const id = setInterval(() => setServing((n) => (n >= 26 ? 23 : n + 1)), 2800);
    return () => clearInterval(id);
  }, []);

  const ahead = YOUR_NUMBER - serving - 1;
  const progress = ((serving - 22) / (YOUR_NUMBER - 22)) * 100;
  const soon = ahead <= 1;

  return (
    <div className="ql-scene" aria-hidden="true">
      <div className="ql-phone">
        <div className="ql-phone-notch" />
        <div className="ql-phone-screen">
          <p className="ql-phone-place">💈 Fade &amp; Blade Barbers</p>
          <div className="ql-phone-ticket">
            <span>Your number</span>
            <strong>A{YOUR_NUMBER}</strong>
          </div>
          <div className="ql-phone-row">
            <div>
              <span>Now serving</span>
              <strong key={serving} className="ql-pop">
                A{serving}
              </strong>
            </div>
            <div>
              <span>Ahead of you</span>
              <strong>{ahead}</strong>
            </div>
          </div>
          <div className="ql-progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <p className={soon ? "ql-phone-status ql-phone-soon" : "ql-phone-status"}>
            {soon ? "🔔 Get ready – almost your turn" : `≈ ${ahead * 15} min wait`}
          </p>
        </div>
      </div>

      <div className={soon ? "ql-float ql-float-alert ql-float-show" : "ql-float ql-float-alert"}>
        <span className="ql-float-icon">🔔</span>
        <div>
          <strong>Your turn is coming soon</strong>
          <span>Ticket A{YOUR_NUMBER} · head to the counter</span>
        </div>
      </div>

      <div className="ql-float ql-float-serving">
        <span>Currently serving</span>
        <strong key={serving} className="ql-pop">
          A{serving}
        </strong>
      </div>

      <ul className="ql-places">
        {PLACES.map((p) => (
          <li key={p.label}>
            <span>{p.icon}</span>
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || location.state?.from || "/dashboard";

  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
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
    if (!form.email.trim()) errors.email = "Email is required.";
    else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
    if (!form.password) errors.password = "Password is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      // `remember` is passed as a second argument, so an existing login(form) keeps working.
      await login({ email: form.email.trim(), password: form.password }, { remember });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ql-page">
      <div className="ql-diagonal" />

      <header className="ql-top">
        <Link to="/" className="ql-logo">
          <span className="ql-logo-mark">🕐</span>
          Queue<b>Less</b>
        </Link>
        <Link to="/" className="ql-guest-pill">
          Join a queue as guest →
        </Link>
      </header>

      <section className="ql-hero">
        <QueueScene />
        <blockquote className="ql-slogan">
          <p>“Wait less. Live more.”</p>
          <footer>Join from your phone – we'll call you when it's your turn.</footer>
        </blockquote>
      </section>

      <main className="ql-card-area">
        <div className="ql-card">
          <h1>Hi there, welcome back 👋</h1>
          <p className="ql-card-sub">Log in to manage your queue.</p>

          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="ql-alert" role="alert">
                {error}
              </div>
            )}

            <div className="ql-field">
              <label htmlFor="email">
                Email<span>*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={updateField}
                className={fieldErrors.email ? "ql-invalid" : ""}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className="ql-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="ql-field">
              <label htmlFor="password">
                Password<span>*</span>
              </label>
              <div className="ql-password">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={updateField}
                  className={fieldErrors.password ? "ql-invalid" : ""}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="ql-eye"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={!showPassword} />
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="ql-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="ql-row">
              <label className="ql-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span className="ql-checkbox" />
                Remember me
              </label>
              <Link to="/forgot-password" className="ql-link">
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="ql-submit" disabled={submitting}>
              {submitting && <span className="ql-spinner" aria-hidden="true" />}
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="ql-signup">
            Don't have an account?{" "}
            <Link to="/register" className="ql-link">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
