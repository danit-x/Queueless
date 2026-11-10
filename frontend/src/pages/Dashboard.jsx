import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageQueues, getMyTickets, getQueues, joinQueue } from "../services/queueService";
import "./Dashboard.css";

const SERVICE_CATEGORIES = [
  {
    id: "barber",
    name: "Barber",
    description: "Haircuts and grooming services",
    icon: "💈",
    match: ["barber", "hair", "groom", "salon"],
  },
  {
    id: "restaurant",
    name: "Restaurant",
    description: "Restaurant waiting queues",
    icon: "🍽️",
    match: ["restaurant", "cafe", "café", "food", "dining"],
  },
  {
    id: "clinic",
    name: "Clinic",
    description: "Medical consultation queues",
    icon: "🏥",
    match: ["clinic", "medical", "doctor", "hospital", "health"],
  },
  {
    id: "bank",
    name: "Bank",
    description: "Banking service queues",
    icon: "🏦",
    match: ["bank", "banking", "finance"],
  },
  {
    id: "repair",
    name: "Repair Shop",
    description: "Repair and maintenance queues",
    icon: "🔧",
    match: ["repair", "maintenance", "workshop", "mechanic"],
  },
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "services", label: "Available Services", icon: "services" },
  { id: "tickets", label: "My Tickets", icon: "ticket" },
  { id: "history", label: "Queue History", icon: "history" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "profile", label: "My Profile", icon: "user" },
];

function queueText(queue) {
  return `${queue.category || ""} ${queue.name || ""} ${queue.description || ""}`.toLowerCase();
}

function queuesForCategory(category, queues) {
  return queues.filter((queue) => category.match.some((word) => queueText(queue).includes(word)));
}

function padCount(value) {
  return String(value).padStart(2, "0");
}

function firstName(user) {
  const name = user?.name?.trim();
  if (!name) return "";
  return name.split(/\s+/)[0];
}

function initials(user) {
  const name = user?.name?.trim();
  if (!name) return "QL";
  const parts = name.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function statusLabel(status) {
  if (status === "serving") return "Your turn";
  if (status === "served") return "Completed";
  if (status === "cancelled") return "Left queue";
  if (status === "no_show") return "No-show";
  return "Waiting";
}

function Icon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === "services") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    );
  }
  if (name === "ticket") {
    return (
      <svg {...common}>
        <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
        <path d="M12 6v12" />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (name === "bell") {
    return (
      <svg {...common}>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
    );
  }
  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
    </svg>
  );
}

export default function Dashboard() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [queues, setQueues] = useState([]);
  const [selectedQueues, setSelectedQueues] = useState([]);
  const [selectedQueuesLoading, setSelectedQueuesLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningQueueId, setJoiningQueueId] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ownQueues, setOwnQueues] = useState([]);
  const canManage = canManageQueues(user);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      try {
        // Staff also load every queue they own, whatever its status, so a
        // paused or closed queue never disappears from their dashboard.
        const [queueData, ticketData, ownQueueData] = await Promise.all([
          getQueues({ status: "all" }),
          getMyTickets({ status: "all" }),
          canManage ? getQueues({ status: "all", mine: true }) : null,
        ]);
        if (!mounted) return;
        setQueues(queueData.queues || []);
        setTickets(ticketData.tickets || []);
        setOwnQueues(ownQueueData?.queues || []);
        setError("");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || "Unable to load your dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      mounted = false;
    };
  }, [canManage]);

  useEffect(() => {
    if (!selectedCategory) {
      setSelectedQueues([]);
      setSelectedQueuesLoading(false);
      return undefined;
    }

    let mounted = true;
    setSelectedQueuesLoading(true);
    setError("");

    getQueues({ status: "all", category: selectedCategory.name })
      .then((queueData) => {
        if (mounted) setSelectedQueues(queueData.queues || []);
      })
      .catch((loadError) => {
        if (!mounted) return;
        setSelectedQueues([]);
        setError(loadError.message || "Unable to load queues for this service.");
      })
      .finally(() => {
        if (mounted) setSelectedQueuesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedId]);

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "waiting" || ticket.status === "serving"),
    [tickets]
  );
  const completedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "served"),
    [tickets]
  );
  const historyTickets = useMemo(
    () => tickets.filter(
      (ticket) => ticket.status === "served" ||
        ticket.status === "cancelled" ||
        ticket.status === "no_show"
    ),
    [tickets]
  );
  const activeTicket = activeTickets[0] ?? null;
  const name = firstName(user);
  const alerts = useMemo(() => {
    return activeTickets.flatMap((ticket) => {
      if (ticket.status === "serving") {
        return [{ id: `${ticket.id}-now`, text: `${ticket.code} is being served. Please head to ${ticket.queueName}.` }];
      }
      if (ticket.peopleAhead <= 2) {
        return [{ id: `${ticket.id}-soon`, text: `${ticket.code} at ${ticket.queueName} is coming up. ${ticket.peopleAhead} ahead.` }];
      }
      return [];
    });
  }, [activeTickets]);

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SERVICE_CATEGORIES;
    return SERVICE_CATEGORIES.filter((category) =>
      `${category.name} ${category.description}`.toLowerCase().includes(term)
    );
  }, [search]);

  const selectedCategory = SERVICE_CATEGORIES.find((category) => category.id === selectedId) ?? null;

  function openSection(next) {
    setSection(next);
    setMenuOpen(false);
    if (next !== "services") setSelectedId(null);
  }

  function openService(categoryId) {
    setSelectedId(categoryId);
    setSection("services");
    setMenuOpen(false);
  }

  async function handleJoinQueue(queueId) {
    setJoiningQueueId(queueId);
    setError("");
    try {
      await joinQueue(queueId);
      const [queueData, ticketData] = await Promise.all([
        getQueues({ status: "all" }),
        getMyTickets({ status: "all" }),
      ]);
      setQueues(queueData.queues || []);
      setTickets(ticketData.tickets || []);
      setSection("tickets");
    } catch (joinError) {
      setError(joinError.message || "Unable to join this queue.");
    } finally {
      setJoiningQueueId(null);
    }
  }

  function handleSearch(value) {
    setSearch(value);
    if (value.trim()) {
      setSection("services");
      setSelectedId(null);
    }
  }

  return (
    <div className={`cd-shell ${menuOpen ? "is-open" : ""}`}>
      <aside className="cd-sidebar">
        <Link to="/" className="cd-brand" onClick={() => setMenuOpen(false)}>
          Queue<span>Less</span>
        </Link>
        <nav className="cd-nav" aria-label="Customer">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "is-active" : ""}
              onClick={() => openSection(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "notifications" && alerts.length > 0 && (
                <span className="cd-nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="cd-sidebar-foot">
          {isAuthenticated ? (
            <button
              type="button"
              className="cd-logout"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Logout
            </button>
          ) : (
            <Link className="cd-logout" to="/login">
              Log in
            </Link>
          )}
        </div>
      </aside>

      {menuOpen && <button type="button" className="cd-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <div className="cd-workspace">
        <header className="cd-top">
          <button type="button" className="cd-menu" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <p className="cd-hello-line">
            Hello, <strong>{name || "there"}</strong>!
          </p>
          <label className="cd-search">
            <Icon name="search" />
            <input
              type="search"
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Search services"
              aria-label="Search services"
            />
          </label>
          <button
            type="button"
            className="cd-icon-btn"
            aria-label={alerts.length ? `${alerts.length} notifications` : "Notifications"}
            onClick={() => openSection("notifications")}
          >
            <Icon name="bell" />
            {alerts.length > 0 && <span className="cd-dot">{alerts.length}</span>}
          </button>
          <button type="button" className="cd-userchip" onClick={() => openSection("profile")}>
            <span className="cd-avatar" aria-hidden="true">{initials(user)}</span>
            <span>{user?.name || "Guest"}</span>
          </button>
        </header>

        <main className="cd-content">
          {error && (
            <p className="cd-banner" role="alert">
              {error}
            </p>
          )}

          {section === "dashboard" && (
            <>
              <section className="cd-welcome">
                <p className="cd-kicker">Customer dashboard</p>
                <h1>Hello! Welcome to QueueLess 👋</h1>
                <p>Skip the waiting. Join a queue and manage your time better.</p>
              </section>

              <section className="cd-stats" aria-label="Dashboard statistics">
                <article className="cd-stat">
                  <strong>{loading ? "—" : padCount(activeTickets.length)}</strong>
                  <span>Active Tickets</span>
                </article>
                <article className="cd-stat">
                  <strong>{loading ? "—" : padCount(completedTickets.length)}</strong>
                  <span>Completed Visits</span>
                </article>
              </section>

              {canManage && <StaffQueues queues={ownQueues} loading={loading} />}

              <ServiceSection
                categories={visibleCategories}
                queues={queues}
                loading={loading}
                selectedId={selectedId}
                onOpen={openService}
                showHeading
              />

              <CurrentQueue ticket={activeTicket} loading={loading} onBrowse={() => openSection("services")} />
            </>
          )}

          {section === "services" && (
            <>
              <section className="cd-welcome cd-welcome-compact">
                <h1>Available Services</h1>
                <p>Choose a service to join its queue.</p>
              </section>
              {selectedCategory ? (
                <QueueList
                  category={selectedCategory}
                  queues={selectedQueues}
                  loading={selectedQueuesLoading}
                  activeTicket={activeTicket}
                  joiningQueueId={joiningQueueId}
                  canManage={canManage}
                  onJoin={handleJoinQueue}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <ServiceSection
                  categories={visibleCategories}
                  queues={queues}
                  loading={loading}
                  selectedId={selectedId}
                  onOpen={openService}
                />
              )}
            </>
          )}

          {section === "tickets" && (
            <TicketList
              title="My Tickets"
              empty="You have no active tickets. Join a service queue to get one."
              tickets={activeTickets}
              loading={loading}
            />
          )}

          {section === "history" && (
            <TicketList
              title="Queue History"
              empty="Completed and cancelled visits will show up here."
              tickets={historyTickets}
              loading={loading}
            />
          )}

          {section === "notifications" && (
            <section className="cd-panel">
              <h1>Notifications</h1>
              {alerts.length === 0 ? (
                <p className="cd-muted">You're all caught up. We'll flag a ticket when your turn is close.</p>
              ) : (
                <ul className="cd-list">
                  {alerts.map((alert) => (
                    <li key={alert.id}>{alert.text}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {section === "profile" && (
            <section className="cd-panel cd-profile">
              <h1>My Profile</h1>
              <span className="cd-avatar cd-avatar-lg" aria-hidden="true">{initials(user)}</span>
              <p className="cd-profile-name">{user?.name || "Guest"}</p>
              <p className="cd-muted">{user?.email || "Sign in to save tickets to your account."}</p>
              {user?.role && <p className="cd-role">{user.role}</p>}
              {isAuthenticated && (
                <Link className="cd-btn" to="/profile">
                  Edit profile
                </Link>
              )}
              {isAuthenticated ? (
                <button
                  type="button"
                  className="cd-btn cd-btn-ghost"
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  Logout
                </button>
              ) : (
                <Link className="cd-btn" to="/login">Log in</Link>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

const QUEUE_STATUS = {
  active: { label: "Active", className: "cd-pill cd-pill-on" },
  paused: { label: "Paused", className: "cd-pill cd-pill-wait" },
  closed: { label: "Closed", className: "cd-pill" },
};

function StaffQueues({ queues, loading }) {
  return (
    <section className="cd-panel">
      <div className="cd-staff-head">
        <h2>Your Queues</h2>
        <Link className="cd-btn" to="/queues/new">
          + Create queue
        </Link>
      </div>
      {loading ? (
        <p className="cd-muted" role="status">Loading your queues...</p>
      ) : queues.length === 0 ? (
        <p className="cd-muted">You don't manage any queues yet. Create one to start serving customers.</p>
      ) : (
        <div className="cd-queue-list">
          {queues.map((queue) => {
            const status = QUEUE_STATUS[queue.status] ?? { label: queue.status, className: "cd-pill" };
            return (
              <article key={queue.id} className="cd-queue">
                <div>
                  <h3>{queue.name}</h3>
                  <p>
                    {queue.category} · {queue.waitingCount} waiting · now serving {queue.currentServing ?? "—"}
                  </p>
                </div>
                <span className={status.className}>{status.label}</span>
                <Link className="cd-btn" to={`/queues/${queue.id}/manage`}>
                  Manage queue
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ServiceSection({ categories, queues, loading, selectedId, onOpen, showHeading = false }) {
  return (
    <section className="cd-block" aria-labelledby={showHeading ? "services-heading" : undefined}>
      {showHeading && (
        <div className="cd-block-head">
          <h2 id="services-heading">Available Services</h2>
          <p>Choose a service to join its queue.</p>
        </div>
      )}
      {categories.length === 0 ? (
        <p className="cd-muted">No services match that search.</p>
      ) : (
        <div className="cd-grid">
          {categories.map((category) => {
            const matches = queuesForCategory(category, queues);
            const activeCount = matches.filter((queue) => queue.status === "active").length;
            const available = activeCount > 0;
            return (
              <article key={category.id} className={`cd-service ${selectedId === category.id ? "is-selected" : ""}`}>
                <div className="cd-service-top">
                  <span className="cd-service-icon" aria-hidden="true">{category.icon}</span>
                  <span className={available ? "cd-pill cd-pill-on" : "cd-pill"}>
                    {loading ? "Checking" : available ? "Available" : "Unavailable"}
                  </span>
                </div>
                <h3>{category.name}</h3>
                <p>{category.description}</p>
                <p className="cd-service-meta">
                  {loading
                    ? "Looking up queues…"
                    : available
                      ? `${activeCount} available ${activeCount === 1 ? "queue" : "queues"}`
                      : "No active queues"}
                </p>
                <button type="button" className="cd-btn" onClick={() => onOpen(category.id)}>
                  View service
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QueueList({
  category,
  queues,
  loading,
  activeTicket,
  joiningQueueId,
  canManage,
  onJoin,
  onBack,
}) {
  return (
    <section className="cd-service-details">
      <button type="button" className="cd-text-link cd-back-link" onClick={onBack}>
        ← All services
      </button>
      <header className="cd-service-heading">
        <span className="cd-service-icon" aria-hidden="true">{category.icon}</span>
        <div>
          <p className="cd-kicker">Available services</p>
          <h2>{category.name} Services</h2>
          <p>{category.description}</p>
          <p>Choose an available queue to continue.</p>
        </div>
      </header>
      {loading ? (
        <p className="cd-muted" role="status">Loading available queues...</p>
      ) : queues.length === 0 ? (
        <p className="cd-panel cd-muted">There are no queues for this service right now. Check again later.</p>
      ) : (
        <div className="cd-queue-list">
          {queues.map((queue) => {
            const alreadyJoined = activeTicket?.queueId === queue.id;
            const isActive = queue.status === "active";
            return (
              <article key={queue.id} className="cd-queue cd-queue-card">
                <div className="cd-queue-heading">
                  <div>
                    <h3>{queue.name}</h3>
                    <p>{queue.description || category.description}</p>
                  </div>
                  <span className={`cd-pill cd-pill-${queue.status}`}>
                    {queue.status === "active" ? "Active" : queue.status === "paused" ? "Paused" : "Closed"}
                  </span>
                </div>
                <div className="cd-queue-stats">
                  <div><span>People waiting</span><strong>{queue.waitingCount}</strong></div>
                  <div><span>Average service time</span><strong>{queue.avgServiceMinutes} minutes</strong></div>
                  <div><span>Estimated wait</span><strong>{queue.estimatedWaitMinutes} minutes</strong></div>
                </div>
                <div className="cd-queue-actions">
                  <Link className="cd-btn cd-btn-secondary" to={`/queues/${queue.id}`}>
                    View Queue
                  </Link>
                  {alreadyJoined ? (
                    <Link className="cd-btn" to={`/tickets/${activeTicket.id}`}>
                      View ticket {activeTicket.code}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="cd-btn"
                      onClick={() => onJoin(queue.id)}
                      disabled={!isActive || Boolean(activeTicket) || joiningQueueId !== null}
                    >
                      {joiningQueueId === queue.id
                        ? "Joining..."
                        : isActive
                          ? "Join Queue"
                          : queue.status === "paused"
                            ? "Temporarily paused"
                            : "Queue closed"}
                    </button>
                  )}
                  {canManage && (
                    <Link className="cd-text-link" to={`/queues/${queue.id}/manage`}>
                      Manage queue
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {activeTicket && <p className="cd-muted">You can join one queue at a time.</p>}
    </section>
  );
}

function CurrentQueue({ ticket, loading, onBrowse }) {
  const position = ticket ? (ticket.status === "serving" ? "Now" : ticket.peopleAhead + 1) : null;

  return (
    <section className="cd-panel">
      <h2>My Current Queue</h2>
      {loading ? (
        <p className="cd-muted" role="status">Loading your queue...</p>
      ) : !ticket ? (
        <div className="cd-empty">
          <p>You are not in a queue yet.</p>
          <button type="button" className="cd-btn" onClick={onBrowse}>
            Browse services
          </button>
        </div>
      ) : (
        <div className="cd-ticket">
          <div>
            <p className="cd-ticket-code">Ticket {ticket.code}</p>
            <p className="cd-muted">{ticket.queueName}</p>
          </div>
          <span className={`cd-pill ${ticket.status === "serving" ? "cd-pill-on" : "cd-pill-wait"}`}>
            {statusLabel(ticket.status)}
          </span>
          <p className="cd-position">
            Position: <strong>{position}</strong>
          </p>
          <Link className="cd-btn" to={`/tickets/${ticket.id}`}>
            View ticket
          </Link>
        </div>
      )}
    </section>
  );
}

function TicketList({ title, empty, tickets, loading }) {
  return (
    <section className="cd-panel">
      <h1>{title}</h1>
      {loading ? (
        <p className="cd-muted" role="status">Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <p className="cd-muted">{empty}</p>
      ) : (
        <ul className="cd-list">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <div>
                <strong>{ticket.code}</strong>
                <span>{ticket.queueName}</span>
              </div>
              <span className="cd-pill">{statusLabel(ticket.status)}</span>
              <Link to={`/tickets/${ticket.id}`}>
                {ticket.status === "no_show" ? "View details" : "Open"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
