import { Link } from "react-router-dom";
import queueWatermark from "../queue-watermark.svg";
import "./Home.css";

const STEPS = [
  { icon: "📲", title: "Join the queue", text: "Pick a place and get your number from your phone." },
  { icon: "👀", title: "Track your turn", text: "See the number being served and how many people are ahead." },
  { icon: "🔔", title: "Get notified", text: "We alert you when your turn is coming soon." },
];

const PLACES = [
  { icon: "💈", name: "Barber" },
  { icon: "🍽️", name: "Restaurant" },
  { icon: "🏥", name: "Clinic" },
  { icon: "🏦", name: "Bank" },
  { icon: "🔧", name: "Repair shop" },
];

export default function Home() {
  return (
    <div className="hm-page">
      {/* Hero */}
      <section className="hm-hero">
        <img className="hm-queue-art" src={queueWatermark} alt="" aria-hidden="true" />
        <div className="hm-hero-text">
          <h1>
            Skip the line,
            <br />
            not your turn.
          </h1>
          <p>
            Join a queue from your phone and wait wherever you like. QueueLess tells you when it's your turn.
          </p>
          <div className="hm-hero-buttons">
            <Link to="/dashboard" className="hm-btn hm-btn-big">
              Join a Queue
            </Link>
            <a href="#how" className="hm-btn hm-btn-light hm-btn-big">
              How it works
            </a>
          </div>
        </div>

      </section>

      {/* How it works */}
      <section id="how" className="hm-section">
        <h2>How it works</h2>
        <div className="hm-steps">
          {STEPS.map((step, index) => (
            <div key={step.title} className="hm-card">
              <span className="hm-step-number">{index + 1}</span>
              <span className="hm-icon">{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Places */}
      <section className="hm-section">
        <h2>Works for many places</h2>
        <div className="hm-places">
          {PLACES.map((place) => (
            <div key={place.name} className="hm-place">
              <span>{place.icon}</span>
              {place.name}
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="hm-cta">
        <h2>Ready to stop waiting in line?</h2>
        <Link to="/register" className="hm-btn hm-btn-white hm-btn-big">
          Create a free account
        </Link>
      </section>

      <footer className="hm-footer">© {new Date().getFullYear()} QueueLess</footer>
    </div>
  );
}
