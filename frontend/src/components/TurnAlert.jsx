import { useEffect, useRef, useState } from "react";
import { TURN_SOON_THRESHOLD } from "../services/queueService";

const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

function alertLevelFor(ticket) {
  if (ticket.status === "serving") return "now";
  if (ticket.status === "waiting" && ticket.peopleAhead <= TURN_SOON_THRESHOLD) return "soon";
  return null;
}

const messages = {
  soon: {
    title: "Your turn is coming soon",
    body: (ticket) =>
      ticket.peopleAhead === 0
        ? "You're next. Please make your way to the counter."
        : `Only ${ticket.peopleAhead} ${ticket.peopleAhead === 1 ? "person" : "people"} ahead of you.`,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  now: {
    title: "It's your turn!",
    body: (ticket) => `Ticket ${ticket.code} is being served now at ${ticket.queueName}.`,
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
};

// In-page banner plus a one-time browser notification each time the alert level rises.
export default function TurnAlert({ ticket }) {
  const level = alertLevelFor(ticket);
  const lastNotified = useRef(null);
  const [permission, setPermission] = useState(
    notificationsSupported ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (!level || lastNotified.current === level) return;
    lastNotified.current = level;

    if (permission === "granted") {
      new Notification(`🔔 ${messages[level].title}`, { body: messages[level].body(ticket) });
    }
  }, [level, permission, ticket]);

  async function enableNotifications() {
    setPermission(await Notification.requestPermission());
  }

  return (
    <>
      {level && (
        <div role="status" className={`rounded-lg border p-4 ${messages[level].className}`}>
          <p className="font-semibold">🔔 {messages[level].title}</p>
          <p className="mt-1 text-sm">{messages[level].body(ticket)}</p>
        </div>
      )}
      {permission === "default" && ticket.status === "waiting" && (
        <p className="text-sm text-slate-600">
          Want an alert even when this tab is in the background?{" "}
          <button
            type="button"
            onClick={enableNotifications}
            className="font-medium text-brand-700 hover:underline"
          >
            Enable notifications
          </button>
        </p>
      )}
    </>
  );
}
