import { useEffect, useState } from "react";
import "./Dashboard.css";

// Services customers can queue for.
// TODO: load these from the backend later (GET /api/queues).
const SERVICES = [
  { id: "barber", icon: "💈", name: "Barber", prefix: "B", waiting: 4 },
  { id: "restaurant", icon: "🍽️", name: "Restaurant", prefix: "R", waiting: 6 },
  { id: "clinic", icon: "🏥", name: "Clinic", prefix: "C", waiting: 3 },
  { id: "bank", icon: "🏦", name: "Bank", prefix: "K", waiting: 5 },
  { id: "repair", icon: "🔧", name: "Repair", prefix: "F", waiting: 2 },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const [ticket, setTicket] = useState(null);

  // Demo only: the line moves forward every 8 seconds.
  // Replace with a call to the backend (GET /api/tickets/:id) later.
  useEffect(() => {
    if (!ticket || ticket.ahead === 0) return;
    const timer = setTimeout(() => {
      setTicket((t) => ({ ...t, ahead: t.ahead - 1, serving: t.serving + 1 }));
    }, 8000);
    return () => clearTimeout(timer);
  }, [ticket]);

  function joinQueue(service) {
    // TODO: replace with POST /api/queues/:id/tickets
    const serving = 20 + Math.floor(Math.random() * 5);
    setTicket({
      service,
      number: serving + service.waiting + 1,
      serving,
      ahead: service.waiting,
    });
  }

  function leaveQueue() {
    setTicket(null);
  }

  function scrollToServices() {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="cd-page">
      <main className="cd-main">
        {/* Greeting */}
        <section className="cd-hello">
          <h1>{getGreeting()}! 👋</h1>
          <p>Manage your queues without waiting in line.</p>
        </section>

        {/* Current queue */}
        <section className="cd-card cd-current">
          <h2>Your Current Queue</h2>

          {!ticket ? (
            <div className="cd-empty">
              <p>No active queue</p>
              <button className="cd-btn" onClick={scrollToServices}>
                Join a Queue
              </button>
            </div>
          ) : (
            <div className="cd-ticket">
              <p className="cd-ticket-place">
                {ticket.service.icon} {ticket.service.name}
              </p>

              <div className="cd-numbers">
                <div className="cd-box cd-box-mine">
                  <span>Your number</span>
                  <strong>
                    {ticket.service.prefix}
                    {ticket.number}
                  </strong>
                </div>
                <div className="cd-box">
                  <span>Now serving</span>
                  <strong>
                    {ticket.service.prefix}
                    {ticket.serving}
                  </strong>
                </div>
                <div className="cd-box">
                  <span>People ahead</span>
                  <strong>{ticket.ahead}</strong>
                </div>
              </div>

              {ticket.ahead === 0 ? (
                <p className="cd-alert cd-alert-now">✅ It's your turn! Please go to the counter.</p>
              ) : ticket.ahead <= 2 ? (
                <p className="cd-alert">🔔 Your turn is coming soon.</p>
              ) : null}

              <button className="cd-btn cd-btn-outline" onClick={leaveQueue}>
                Leave Queue
              </button>
            </div>
          )}
        </section>

        {/* Services */}
        <section id="services">
          <h2 className="cd-title">Available Services</h2>
          <div className="cd-grid">
            {SERVICES.map((service) => (
              <div key={service.id} className="cd-card cd-service">
                <span className="cd-icon">{service.icon}</span>
                <h3>{service.name}</h3>
                <p>{service.waiting} people waiting</p>
                <button className="cd-btn" onClick={() => joinQueue(service)} disabled={Boolean(ticket)}>
                  Join Queue
                </button>
              </div>
            ))}
          </div>
          {ticket && <p className="cd-note">You can join one queue at a time.</p>}
        </section>
      </main>
    </div>
  );
}
