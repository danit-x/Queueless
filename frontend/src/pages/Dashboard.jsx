import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageQueues, getMyTickets, getQueues, joinQueue } from "../services/queueService";
import "./Dashboard.css";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [queues, setQueues] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningQueueId, setJoiningQueueId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      try {
        const [queueData, ticketData] = await Promise.all([
          getQueues(),
          getMyTickets({ status: "active" }),
        ]);
        if (!mounted) return;
        setQueues(queueData.queues);
        setTickets(ticketData.tickets);
        setError("");
      } catch (loadError) {
        if (mounted) setError(loadError.message || "Unable to load queues.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  function scrollToServices() {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleJoinQueue(queueId) {
    setJoiningQueueId(queueId);
    setError("");
    try {
      await joinQueue(queueId);
      const [queueData, ticketData] = await Promise.all([
        getQueues(),
        getMyTickets({ status: "active" }),
      ]);
      setQueues(queueData.queues);
      setTickets(ticketData.tickets);
    } catch (joinError) {
      setError(joinError.message || "Unable to join this queue.");
    } finally {
      setJoiningQueueId(null);
    }
  }

  const activeTicket = tickets[0] ?? null;
  const canManage = canManageQueues(user);

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

          {loading ? (
            <p role="status" className="cd-empty">Loading your queue...</p>
          ) : !activeTicket ? (
            <div className="cd-empty">
              <p>No active queue</p>
              <button className="cd-btn" onClick={scrollToServices}>
                Join a Queue
              </button>
            </div>
          ) : (
            <div className="cd-ticket">
              <p className="cd-ticket-place">
                {activeTicket.queueName}
              </p>

              <div className="cd-numbers">
                <div className="cd-box cd-box-mine">
                  <span>Your number</span>
                  <strong>{activeTicket.code}</strong>
                </div>
                <div className="cd-box">
                  <span>Now serving</span>
                  <strong>{activeTicket.currentServing ?? "—"}</strong>
                </div>
                <div className="cd-box">
                  <span>People ahead</span>
                  <strong>{activeTicket.peopleAhead}</strong>
                </div>
              </div>

              {activeTicket.status === "serving" ? (
                <p className="cd-alert cd-alert-now">✅ It's your turn! Please go to the counter.</p>
              ) : activeTicket.peopleAhead <= 2 ? (
                <p className="cd-alert">🔔 Your turn is coming soon.</p>
              ) : null}

              <Link className="cd-btn" to={`/tickets/${activeTicket.id}`}>View ticket</Link>
            </div>
          )}
        </section>

        {/* Services */}
        <section id="services">
          <h2 className="cd-title">Available Services</h2>
          {error && <p className="cd-alert" role="alert">{error}</p>}
          {loading ? (
            <p role="status">Loading queues...</p>
          ) : queues.length === 0 ? (
            <p>No active queues are available right now.</p>
          ) : (
          <div className="cd-grid">
            {queues.map((queue) => (
              <div key={queue.id} className="cd-card cd-service">
                <span className="cd-icon">⌛</span>
                <h3>{queue.name}</h3>
                <p>{queue.category} · {queue.waitingCount} waiting</p>
                <p>Now serving {queue.currentServing ?? "—"}</p>
                {activeTicket?.queueId === queue.id ? (
                  <Link className="cd-btn" to={`/tickets/${activeTicket.id}`}>View ticket {activeTicket.code}</Link>
                ) : (
                  <button
                    className="cd-btn"
                    onClick={() => handleJoinQueue(queue.id)}
                    disabled={loading || Boolean(activeTicket) || joiningQueueId !== null}
                  >
                    {joiningQueueId === queue.id ? "Joining..." : "Join Queue"}
                  </button>
                )}
                {canManage && (
                  <Link className="cd-note" to={`/queues/${queue.id}/manage`}>Manage queue</Link>
                )}
              </div>
            ))}
          </div>
          )}
          {activeTicket && <p className="cd-note">You can join one queue at a time.</p>}
        </section>
      </main>
    </div>
  );
}
