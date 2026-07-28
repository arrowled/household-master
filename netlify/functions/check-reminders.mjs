const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ONESIGNAL_APP_ID",
  "ONESIGNAL_REST_API_KEY"
];

const ICONS = {
  meal: "🍽️",
  thaw: "🥩",
  grocery: "🛒",
  practice: "🏈",
  birthday: "🎂",
  bill: "💰",
  appointment: "🩺",
  school: "🎓",
  custom: "📅",
  family: "📅"
};

function assertEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing Netlify environment variables: ${missing.join(", ")}`);
  }
}

function eventDate(event) {
  const date = new Date(event.start_date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reminderDate(event) {
  const start = eventDate(event);
  const minutes = Number(event.reminder_minutes);
  if (!start || !Number.isFinite(minutes)) return null;
  return new Date(start.getTime() - minutes * 60_000);
}

function reminderIsDue(event, now) {
  if (!event.notification_enabled || event.notification_sent) return false;
  const start = eventDate(event);
  const due = reminderDate(event);
  if (!start || !due) return false;

  // Matches the existing app behavior: catch the reminder after its due minute,
  // up through ten minutes after the event begins.
  return now.getTime() >= due.getTime() &&
    now.getTime() <= start.getTime() + 10 * 60_000;
}

function formatMessage(event) {
  const start = eventDate(event);
  const icon = ICONS[event.event_type] || "📅";
  const title = event.title || "Family reminder";
  if (!start) return `${icon} ${title}`;

  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(start);

  if (event.all_day) return `${icon} ${title} — ${dateText}`;

  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit"
  }).format(start);

  return `${icon} ${title} — ${dateText} at ${timeText}`;
}

function supabaseHeaders(prefer) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function loadPendingEvents() {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/calendar_events`);
  url.searchParams.set("select", "*");
  url.searchParams.set("notification_enabled", "eq.true");
  url.searchParams.set("notification_sent", "eq.false");
  url.searchParams.set("order", "start_date.asc");
  url.searchParams.set("limit", "500");

  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function claimEvent(eventId) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/calendar_events`);
  url.searchParams.set("id", `eq.${eventId}`);
  url.searchParams.set("notification_sent", "eq.false");

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({ notification_sent: true })
  });

  if (!response.ok) throw new Error(`Supabase claim failed: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  return rows.length === 1;
}

async function resetEvent(eventId) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/calendar_events`);
  url.searchParams.set("id", `eq.${eventId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({ notification_sent: false })
  });

  if (!response.ok) console.error("Could not reset reminder", eventId, await response.text());
}

async function sendOneSignal(event) {
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"],
      headings: { en: `Reminder: ${event.title || "Family event"}` },
      contents: { en: formatMessage(event) },
      url: process.env.SITE_URL || "https://magenta-conkies-88e9da.netlify.app",
      name: `calendar-reminder-${event.id}`
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`OneSignal send failed: ${response.status} ${body}`);
  return body ? JSON.parse(body) : {};
}

export default async () => {
  const started = new Date();
  console.log("Netlify reminder check started", started.toISOString());

  try {
    assertEnvironment();
    const events = await loadPendingEvents();
    const dueEvents = events.filter((event) => reminderIsDue(event, started));
    console.log(`Found ${dueEvents.length} due reminder(s)`);

    for (const event of dueEvents) {
      const claimed = await claimEvent(event.id);
      if (!claimed) continue;

      try {
        const result = await sendOneSignal(event);
        console.log("Reminder sent", { eventId: event.id, title: event.title, oneSignalId: result.id || null });
      } catch (error) {
        await resetEvent(event.id);
        throw error;
      }
    }
  } catch (error) {
    console.error("Netlify reminder check failed", error);
    throw error;
  }
};
