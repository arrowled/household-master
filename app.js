const DEFAULT_ITEMS = [
  ["Your take-home pay", "Income", 5135.82, "Income"], ["Wife's new base take-home", "Income", 5779.17, "Income"],
  ["House payment", "Housing", 2900, "Expense"], ["Loan payment", "Debt", 1000, "Expense"], ["Car payment", "Debt", 275, "Expense"],
  ["Insurance", "Insurance", 375, "Expense"], ["Electric + Internet", "Utilities", 340, "Expense"], ["Water", "Utilities", 100, "Expense"],
  ["Trash", "Utilities", 75, "Expense"], ["Home warranty", "Housing", 130, "Expense"], ["Your phone", "Phones", 85, "Expense"],
  ["Wife + kids phones", "Phones", 120, "Expense"], ["Netflix", "Subscriptions", 20, "Expense"], ["Car wash", "Vehicle", 100, "Expense"],
  ["Groceries", "Food", 1000, "Expense"], ["Eating out", "Food", 975, "Expense"], ["Fuel", "Vehicle", 150, "Expense"],
  ["16-year-old gas", "Kids", 80, "Expense"], ["Amazon / household", "Household", 200, "Expense"]];
const CATS = ["Housing", "Debt", "Insurance", "Utilities", "Phones", "Subscriptions", "Vehicle", "Food", "Kids", "Household", "Medical", "School", "Savings", "Entertainment", "Home Improvement", "Other"];
let sb = null, user = null, household = null, items = [], transactions = [], isSignup = false, channel = null;
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const today = () => new Date().toISOString().slice(0, 10);
const selectedMonth = () => ($("monthPicker").value || today().slice(0, 7));
const monthTransactions = () => transactions.filter(x => String(x.spent_on).slice(0, 7) === selectedMonth());
const activeItems = () => items.filter(x => x.active !== false);
function toast(msg) { $("toast").textContent = msg; $("toast").classList.remove("hidden"); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2200) }
function show(id) { ["setupScreen", "authScreen", "householdScreen", "appScreen"].forEach(x => $(x).classList.toggle("hidden", x !== id)); $("nav").classList.toggle("hidden", id !== "appScreen"); $("logout").classList.toggle("hidden", id !== "appScreen" && id !== "householdScreen") }
function initTheme() { const t = localStorage.getItem("budget_theme") || "light"; document.documentElement.dataset.theme = t; $("themeToggle").textContent = t === "dark" ? "☀" : "☾" }
function initClient() {
  const url = "https://xwjuheuyrfjcqkijmbwh.supabase.co";
const key = "sb_publishable_zKvHocurFlYFMF_0myncvw_MVgnr8vE";

  sb = supabase.createClient(url, key);
  return true;
}
$("themeToggle").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; localStorage.setItem("budget_theme", t); $("themeToggle").textContent = t === "dark" ? "☀" : "☾" }
$("saveConfig").onclick = (event) => {
  event.preventDefault();

  const url = $("supabaseUrl").value.trim().replace(/\/rest\/v1\/?$/, "");
  const key = $("supabaseKey").value.trim();

  if (!url || !key) {
    alert("Please enter both the Project URL and publishable key.");
    return;
  }

  localStorage.setItem("sb_url", url);
  localStorage.setItem("sb_key", key);

  location.reload();
};
$("clearConfig").onclick = () => { if (confirm("Clear the connection saved on this device?")) { localStorage.removeItem("sb_url"); localStorage.removeItem("sb_key"); location.reload() } }
$("authSwitch").onclick = () => { isSignup = !isSignup; $("authTitle").textContent = isSignup ? "Create account" : "Sign in"; $("authSubmit").textContent = isSignup ? "Create account" : "Sign in"; $("authSwitch").textContent = isSignup ? "I already have an account" : "Create an account"; $("authMessage").textContent = "" }
$("authSubmit").onclick = async () => { const email = $("email").value.trim(), password = $("password").value; if (!email || !password) { $("authMessage").textContent = "Enter your email and password."; return } let r = isSignup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password }); $("authMessage").textContent = r.error ? r.error.message : (isSignup && !r.data.session ? "Check your email and confirm the account." : "Signed in."); if (r.data.session) await boot() }
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload() }
async function boot() {
  if (!initClient()) return;

  const {
    data: { session }
  } = await sb.auth.getSession();

  if (!session) {
    show("authScreen");
    return;
  }

  user = session.user;
  $("accountEmail").textContent = user.email || "";

  const { data, error } = await sb
    .from("household_members")
    .select("household_id,households(id,name,join_code)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    alert(error.message);
    return;
  }

  if (!data) {
    show("householdScreen");
    return;
  }

  household = data.households;

  show("appScreen");

  $("householdDisplay").textContent = household.name;
  $("codeDisplay").textContent = household.join_code;

  await loadAll();
  await Planner.loadEvents();

  subscribe();

  // Automatic reminder delivery now runs in Netlify, even when this page is closed.
}

$("joinHousehold").onclick = async () => { const { error } = await sb.rpc("join_household", { p_code: $("joinCode").value.trim().toUpperCase() }); $("householdMessage").textContent = error ? error.message : "Joined successfully."; if (!error) await boot() }
async function seedBudget(hid) { const rows = DEFAULT_ITEMS.map(x => ({ household_id: hid, name: x[0], category: x[1], amount: x[2], type: x[3], active: true, created_by: user.id })); const { error } = await sb.from("budget_items").insert(rows); if (error) alert("Household created, but starter budget failed: " + error.message) }
async function loadAll() { const [a, b] = await Promise.all([sb.from("budget_items").select("*").eq("household_id", household.id).order("created_at"), sb.from("transactions").select("*").eq("household_id", household.id).order("spent_on", { ascending: false }).order("created_at", { ascending: false })]); if (a.error || b.error) { alert((a.error || b.error).message); return } items = a.data || []; transactions = b.data || []; render() }
function subscribe() { if (channel) sb.removeChannel(channel); channel = sb.channel("family-" + household.id).on("postgres_changes", { event: "*", schema: "public", table: "budget_items", filter: `household_id=eq.${household.id}` }, loadAll).on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `household_id=eq.${household.id}` }, loadAll).subscribe(s => $("syncStatus").textContent = s === "SUBSCRIBED" ? "● Live sync connected" : "Connecting…") }
function totals() { const inc = activeItems().filter(x => x.type === "Income").reduce((s, x) => s + Number(x.amount), 0); const exp = activeItems().filter(x => x.type === "Expense").reduce((s, x) => s + Number(x.amount), 0); const actual = monthTransactions().reduce((s, x) => s + Number(x.amount), 0); return { inc, exp, actual, remaining: inc - exp, after: inc - actual } }
function rowBudget(x) { return `<article class="listCard ${x.active === false ? "inactive" : ""}"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.category)} · ${x.active ? "Active" : "Paused"}</div><div class="rowActions"><button onclick="editBudget('${x.id}')">Edit</button><button class="secondary" onclick="toggleBudget('${x.id}',${!x.active})">${x.active ? "Pause" : "Activate"}</button><button class="danger-link" onclick="deleteBudget('${x.id}')">Delete</button></div></div><div class="amount ${x.type === "Income" ? "income" : "expense"}">${x.type === "Income" ? "+" : "−"}${money(x.amount)}</div></article>` }
function rowTransaction(x) { return `<article class="listCard"><div><strong>${esc(x.description)}</strong><div class="meta">${esc(x.category)} · ${new Date(x.spent_on + "T12:00:00").toLocaleDateString()}</div><div class="rowActions"><button onclick="editSpending('${x.id}')">Edit</button><button class="danger-link" onclick="deleteSpending('${x.id}')">Delete</button></div></div><div class="amount expense">−${money(x.amount)}</div></article>` }
function categoryData() { const budget = {}; activeItems().filter(x => x.type === "Expense").forEach(x => budget[x.category] = (budget[x.category] || 0) + Number(x.amount)); const actual = {}; monthTransactions().forEach(x => actual[x.category] = (actual[x.category] || 0) + Number(x.amount)); return { budget, actual, categories: [...new Set([...Object.keys(budget), ...Object.keys(actual)])].sort() } }
function progressHtml(limit = 99) { const { budget, actual, categories } = categoryData(); if (!categories.length) return '<p class="empty">No category data yet.</p>'; return categories.slice(0, limit).map(c => { const b = budget[c] || 0, a = actual[c] || 0, pct = b ? Math.min((a / b) * 100, 100) : (a ? 100 : 0); return `<div class="progress-row"><div class="progress-head"><strong>${esc(c)}</strong><span>${money(a)} of ${money(b)}</span></div><div class="progress-track"><div class="progress-fill ${a > b && b > 0 ? "over" : ""}" style="width:${pct}%"></div></div></div>` }).join("") }
function render() {
  const t = totals(); $("income").textContent = money(t.inc); $("expenses").textContent = money(t.exp); $("remaining").textContent = money(t.remaining); $("afterSpending").textContent = money(t.after); $("logged").textContent = money(t.actual); $("rate").textContent = t.inc ? `${(t.remaining / t.inc * 100).toFixed(1)}%` : "0%"; $("categoryProgress").innerHTML = progressHtml(7);
  const budgetQ = $("budgetSearch").value.trim().toLowerCase(), type = $("budgetTypeFilter").value; const budgetRows = items.filter(x => (type === "All" || x.type === type) && (!budgetQ || `${x.name} ${x.category}`.toLowerCase().includes(budgetQ))); $("budgetList").innerHTML = budgetRows.map(rowBudget).join("") || '<p class="empty">No matching budget items.</p>'; $("budgetSummary").textContent = `${budgetRows.length} items · ${money(budgetRows.filter(x => x.type === "Expense" && x.active).reduce((s, x) => s + Number(x.amount), 0))} active expenses`;
  const spendQ = $("spendingSearch").value.trim().toLowerCase(), cat = $("spendingCategoryFilter").value; const month = monthTransactions(); const spendRows = month.filter(x => (cat === "All" || x.category === cat) && (!spendQ || `${x.description} ${x.category}`.toLowerCase().includes(spendQ))); $("spendingList").innerHTML = spendRows.map(rowTransaction).join("") || '<p class="empty">No matching purchases for this month.</p>'; $("spendingTotal").textContent = `${spendRows.length} purchases · ${money(spendRows.reduce((s, x) => s + Number(x.amount), 0))}`;
  $("recentTransactions").innerHTML = month.slice(0, 5).map(rowTransaction).join("") || '<p class="empty">No spending entered for this month.</p>';
  $("reportBudget").textContent = money(t.exp); $("reportActual").textContent = money(t.actual); $("reportDifference").textContent = money(t.exp - t.actual); $("reportCount").textContent = month.length; $("reportCategories").innerHTML = progressHtml();
}
CATS.forEach(c => { $("budgetCategory").insertAdjacentHTML("beforeend", `<option>${c}</option>`); $("spendingCategory").insertAdjacentHTML("beforeend", `<option>${c}</option>`); $("spendingCategoryFilter").insertAdjacentHTML("beforeend", `<option>${c}</option>`) })
$("monthPicker").value = today().slice(0, 7); $("monthPicker").onchange = render; $("budgetSearch").oninput = render; $("budgetTypeFilter").onchange = render; $("spendingSearch").oninput = render; $("spendingCategoryFilter").onchange = render;
function openBudget() { $("budgetForm").reset(); $("budgetId").value = ""; $("budgetActive").checked = true; $("budgetDialogTitle").textContent = "Add budget item"; $("budgetDialog").showModal() }
$("addBudget").onclick = openBudget;
$("budgetForm").onsubmit = async e => { e.preventDefault(); const id = $("budgetId").value, row = { household_id: household.id, name: $("budgetName").value.trim(), category: $("budgetCategory").value, amount: Number($("budgetAmount").value), type: $("budgetType").value, active: $("budgetActive").checked, created_by: user.id }; const r = id ? await sb.from("budget_items").update(row).eq("id", id) : await sb.from("budget_items").insert(row); if (r.error) alert(r.error.message); else { $("budgetDialog").close(); toast(id ? "Budget item updated" : "Budget item added"); await loadAll() } }
window.editBudget = id => { const x = items.find(i => i.id === id); if (!x) return; $("budgetId").value = x.id; $("budgetName").value = x.name; $("budgetCategory").value = x.category; $("budgetAmount").value = x.amount; $("budgetType").value = x.type; $("budgetActive").checked = x.active; $("budgetDialogTitle").textContent = "Edit budget item"; $("budgetDialog").showModal() }
window.toggleBudget = async (id, active) => { const { error } = await sb.from("budget_items").update({ active }).eq("id", id); if (error) alert(error.message); else await loadAll() }
window.deleteBudget = async id => { if (confirm("Delete this budget item?")) { const { error } = await sb.from("budget_items").delete().eq("id", id); if (error) alert(error.message); else await loadAll() } }
function openSpending() { $("spendingForm").reset(); $("spendingId").value = ""; $("spendingDate").value = selectedMonth() === today().slice(0, 7) ? today() : selectedMonth() + "-01"; $("spendingDialogTitle").textContent = "Add purchase"; $("spendingDialog").showModal() }
$("addSpending").onclick = openSpending; $("quickAdd").onclick = openSpending;
$("spendingForm").onsubmit = async e => { e.preventDefault(); const id = $("spendingId").value, row = { household_id: household.id, description: $("spendingName").value.trim(), category: $("spendingCategory").value, amount: Number($("spendingAmount").value), spent_on: $("spendingDate").value, created_by: user.id }; const r = id ? await sb.from("transactions").update(row).eq("id", id) : await sb.from("transactions").insert(row); if (r.error) alert(r.error.message); else { $("spendingDialog").close(); toast(id ? "Purchase updated" : "Purchase added"); await loadAll() } }
window.editSpending = id => { const x = transactions.find(i => i.id === id); if (!x) return; $("spendingId").value = x.id; $("spendingDate").value = x.spent_on; $("spendingName").value = x.description; $("spendingCategory").value = x.category; $("spendingAmount").value = x.amount; $("spendingDialogTitle").textContent = "Edit purchase"; $("spendingDialog").showModal() }
window.deleteSpending = async id => { if (confirm("Delete this purchase?")) { const { error } = await sb.from("transactions").delete().eq("id", id); if (error) alert(error.message); else await loadAll() } }
function go(page) {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x.dataset.page === page));
  document.querySelectorAll(".page").forEach(x => x.classList.toggle("active", x.id === page));

  if (page === "calendarPage") {
    loadCalendarEvents();
  }

  scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => go(b.dataset.page)); document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go)); document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).close())
$("copyCode").onclick = async () => { try { await navigator.clipboard.writeText(household.join_code); toast("Family code copied") } catch { toast("Family code: " + household.join_code) } }
$("exportCsv").onclick = () => { const rows = [["Date", "Description", "Category", "Amount"], ...monthTransactions().map(x => [x.spent_on, x.description, x.category, Number(x.amount).toFixed(2)])]; const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `family-budget-${selectedMonth()}.csv`; a.click(); URL.revokeObjectURL(url) }
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").then(r => r.update()).catch(() => { });
// ============================================================
// FAMILY PLANNER MODULE
// ============================================================

const Planner = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDate: today(),
  activeFilter: "all",
  events: [],

  eventTypes: {
    meal: {
      label: "Meal",
      icon: "🍽️"
    },
    thaw: {
      label: "Lay Meat Out",
      icon: "🥩"
    },
    grocery: {
      label: "Grocery Reminder",
      icon: "🛒"
    },
    practice: {
      label: "Practice",
      icon: "🏈"
    },
    birthday: {
      label: "Birthday",
      icon: "🎂"
    },
    bill: {
      label: "Bill Reminder",
      icon: "💰"
    },
    appointment: {
      label: "Appointment",
      icon: "🩺"
    },
    school: {
      label: "School",
      icon: "🎓"
    },
    custom: {
      label: "Custom Event",
      icon: "📅"
    },
    family: {
      label: "Family Event",
      icon: "📅"
    }
  },

  getTypeInfo(type) {
    return this.eventTypes[type] || this.eventTypes.custom;
  },

  getEventDate(event) {
    if (!event?.start_date) return "";

    return String(event.start_date).slice(0, 10);
  },

  getEventTime(event) {
    if (!event?.start_date || event.all_day) return "";

    const value = String(event.start_date);

    if (value.includes("T")) {
      const parsed = new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit"
        });
      }

      return value.slice(11, 16);
    }

    return "";
  },

  formatDate(dateString, options = {}) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T12:00:00`);

    return date.toLocaleDateString("en-US", {
      weekday: options.weekday || undefined,
      month: options.month || "long",
      day: options.day || "numeric",
      year: options.year || "numeric"
    });
  },

  async loadEvents() {
    const box = $("calendarEvents");

    if (!sb || !household) {
      if (box) {
        box.innerHTML = '<p class="empty">Calendar is waiting for the household connection.</p>';
      }

      return;
    }

    const { data, error } = await sb
      .from("calendar_events")
      .select("*")
      .eq("household_id", household.id)
      .order("start_date", { ascending: true });

    if (error) {
      if (box) {
        box.innerHTML = `<p class="empty">${esc(error.message)}</p>`;
      }

      return;
    }

    this.events = data || [];

    this.renderCalendar();
    this.renderUpcomingEvents();

    if (!$("dayModal").classList.contains("hidden")) {
      this.renderSelectedDayEvents();
    }
  },

  renderCalendar() {
    const grid = $("calendarGrid");
    const monthTitle = $("monthYear");

    if (!grid || !monthTitle) return;

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];

    monthTitle.textContent =
      `${monthNames[this.currentMonth]} ${this.currentYear}`;

    grid.innerHTML = "";

    const weekdays = [
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat"
    ];

    weekdays.forEach(day => {
      const weekday = document.createElement("div");

      weekday.className = "calendarWeekday";
      weekday.textContent = day;

      grid.appendChild(weekday);
    });

    const firstDay = new Date(
      this.currentYear,
      this.currentMonth,
      1
    ).getDay();

    const totalDays = new Date(
      this.currentYear,
      this.currentMonth + 1,
      0
    ).getDate();

    const previousMonthDays = new Date(
      this.currentYear,
      this.currentMonth,
      0
    ).getDate();

    for (let index = firstDay - 1; index >= 0; index--) {
      const previousDay = previousMonthDays - index;

      grid.appendChild(
        this.createDayBox(
          previousDay,
          this.currentMonth - 1,
          this.currentYear,
          true
        )
      );
    }

    for (let day = 1; day <= totalDays; day++) {
      grid.appendChild(
        this.createDayBox(
          day,
          this.currentMonth,
          this.currentYear,
          false
        )
      );
    }

    const totalVisibleBoxes = firstDay + totalDays;
    const remainingBoxes =
      totalVisibleBoxes <= 35
        ? 35 - totalVisibleBoxes
        : 42 - totalVisibleBoxes;

    for (let day = 1; day <= remainingBoxes; day++) {
      grid.appendChild(
        this.createDayBox(
          day,
          this.currentMonth + 1,
          this.currentYear,
          true
        )
      );
    }
  },

  createDayBox(day, month, year, outsideMonth) {
    const date = new Date(year, month, day);
    const dateString = this.toDateString(date);

    const dayBox = document.createElement("button");

    dayBox.type = "button";
    dayBox.className = "calendarDay";
    dayBox.dataset.date = dateString;

    if (outsideMonth) {
      dayBox.classList.add("outsideMonth");
    }

    if (dateString === today()) {
      dayBox.classList.add("today");
    }

    if (dateString === this.selectedDate) {
      dayBox.classList.add("selected");
    }

    const dayNumber = document.createElement("span");

    dayNumber.className = "calendarDayNumber";
    dayNumber.textContent = day;

    dayBox.appendChild(dayNumber);

    const dayEvents = this.events
      .filter(event => this.getEventDate(event) === dateString)
      .filter(event => this.matchesFilter(event));

    const preview = document.createElement("div");

    preview.className = "calendarDayEvents";

    dayEvents.slice(0, 3).forEach(event => {
      const type = this.getTypeInfo(event.event_type);
      const eventPreview = document.createElement("span");

      eventPreview.className =
        `calendarEventPreview event-${event.event_type || "custom"}`;

      eventPreview.textContent =
        `${type.icon} ${event.title || type.label}`;

      preview.appendChild(eventPreview);
    });

    if (dayEvents.length > 3) {
      const more = document.createElement("span");

      more.className = "calendarEventMore";
      more.textContent = `+${dayEvents.length - 3} more`;

      preview.appendChild(more);
    }

    dayBox.appendChild(preview);

    dayBox.addEventListener("click", () => {
      this.openDay(dateString);
    });

    return dayBox;
  },

  matchesFilter(event) {
    if (this.activeFilter === "all") return true;

    if (this.activeFilter === "custom") {
      return [
        "custom",
        "family",
        "appointment",
        "school"
      ].includes(event.event_type);
    }

    return event.event_type === this.activeFilter;
  },

  renderUpcomingEvents() {
    const box = $("calendarEvents");

    if (!box) return;

    const startDate = today();

    const upcoming = this.events
      .filter(event => this.getEventDate(event) >= startDate)
      .filter(event => this.matchesFilter(event))
      .slice(0, 20);

    if (!upcoming.length) {
      box.innerHTML =
        '<p class="empty">No upcoming events for this filter.</p>';

      return;
    }

    box.innerHTML = upcoming.map(event => {
      const type = this.getTypeInfo(event.event_type);
      const date = this.getEventDate(event);
      const time = this.getEventTime(event);

      return `
        <article
          class="calendarEvent"
          data-event-id="${esc(event.id)}"
        >
          <div class="calendarEventIcon">
            ${type.icon}
          </div>

          <div class="calendarEventDetails">
            <strong>${esc(event.title || type.label)}</strong>

            <div class="meta">
              ${esc(this.formatDate(date, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric"
              }))}${time ? ` · ${esc(time)}` : ""}
            </div>

            <div class="meta">
              ${esc(type.label)}
            </div>
          </div>

          <div class="rowActions">
            <button
              type="button"
              class="secondary plannerEditEventBtn"
              data-event-id="${esc(event.id)}"
            >
              Edit
            </button>

            <button
              type="button"
              class="danger-link plannerDeleteEventBtn"
              data-event-id="${esc(event.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
    }).join("");

    box
      .querySelectorAll(".plannerEditEventBtn")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.editEvent(button.dataset.eventId);
        });
      });

    box
      .querySelectorAll(".plannerDeleteEventBtn")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.deleteEvent(button.dataset.eventId);
        });
      });
  },

  openDay(dateString) {
    this.selectedDate = dateString;

    $("selectedDayTitle").textContent =
      this.formatDate(dateString, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      });

    this.renderSelectedDayEvents();
    this.renderCalendar();

    $("dayModal").classList.remove("hidden");
  },

  closeDay() {
    $("dayModal").classList.add("hidden");
  },

  renderSelectedDayEvents() {
    const box = $("selectedDayEvents");

    if (!box) return;

    const dayEvents = this.events.filter(
      event => this.getEventDate(event) === this.selectedDate
    );

    if (!dayEvents.length) {
      box.innerHTML =
        '<p class="empty">No events scheduled for this day.</p>';

      return;
    }

    box.innerHTML = dayEvents.map(event => {
      const type = this.getTypeInfo(event.event_type);
      const time = this.getEventTime(event);

      return `
        <article
          class="calendarEvent selectedDayEvent"
          data-event-id="${esc(event.id)}"
        >
          <div class="calendarEventIcon">
            ${type.icon}
          </div>

          <div class="calendarEventDetails">
            <strong>${esc(event.title || type.label)}</strong>

            <div class="meta">
              ${esc(type.label)}${time ? ` · ${esc(time)}` : ""}
            </div>

            ${
              event.notes
                ? `<p class="calendarEventNotes">${esc(event.notes)}</p>`
                : ""
            }
          </div>

          <div class="rowActions">
            <button
              type="button"
              class="secondary selectedDayEditBtn"
              data-event-id="${esc(event.id)}"
            >
              Edit
            </button>

            <button
              type="button"
              class="danger-link selectedDayDeleteBtn"
              data-event-id="${esc(event.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
    }).join("");

    box
      .querySelectorAll(".selectedDayEditBtn")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.editEvent(button.dataset.eventId);
        });
      });

    box
      .querySelectorAll(".selectedDayDeleteBtn")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.deleteEvent(button.dataset.eventId);
        });
      });
  },

  openEventForm(type = "custom", dateString = this.selectedDate) {
    $("plannerEventForm").reset();
    $("plannerEventId").value = "";
    $("plannerEventType").value = type;
    $("plannerEventDate").value = dateString || today();
    $("plannerFormTitle").textContent =
      `Add ${this.getTypeInfo(type).label}`;
    $("savePlannerEventBtn").textContent = "Save Event";

    this.closeDay();
    $("plannerEventModal").classList.remove("hidden");

    window.setTimeout(() => {
      $("plannerEventTitle").focus();
    }, 50);
  },

  closeEventForm() {
    $("plannerEventModal").classList.add("hidden");
    $("plannerEventForm").reset();
    $("plannerEventId").value = "";
  },

  editEvent(eventId) {
    const event = this.events.find(
      item => String(item.id) === String(eventId)
    );

    if (!event) {
      toast("Event could not be found");
      return;
    }

    $("plannerEventId").value = event.id;

    $("plannerEventType").value =
      this.eventTypes[event.event_type]
        ? event.event_type
        : "custom";

    $("plannerEventTitle").value = event.title || "";
    $("plannerEventDate").value = this.getEventDate(event);
    $("plannerEventNotes").value = event.notes || "";

    $("plannerEventReminder").value =
      event.notification_enabled &&
      event.reminder_minutes !== null
        ? String(event.reminder_minutes)
        : "";

    if (event.all_day) {
      $("plannerEventTime").value = "";
    } else {
      const date = new Date(event.start_date);

      if (!Number.isNaN(date.getTime())) {
        $("plannerEventTime").value =
          `${String(date.getHours()).padStart(2, "0")}:` +
          `${String(date.getMinutes()).padStart(2, "0")}`;
      } else {
        $("plannerEventTime").value =
          String(event.start_date).slice(11, 16);
      }
    }

    $("plannerFormTitle").textContent = "Edit Event";
    $("savePlannerEventBtn").textContent = "Update Event";

    this.closeDay();
    $("plannerEventModal").classList.remove("hidden");
  },

  async saveEvent(event) {
    event.preventDefault();

    if (!sb || !household || !user) {
      toast("The household connection is not ready");
      return;
    }

    const eventId = $("plannerEventId").value;
    const eventType = $("plannerEventType").value;
    const title = $("plannerEventTitle").value.trim();
    const date = $("plannerEventDate").value;
    const time = $("plannerEventTime").value;
    const notes = $("plannerEventNotes").value.trim();
    const reminderValue = $("plannerEventReminder").value;

    if (!title || !date) {
      toast("Enter an event title and date");
      return;
    }

const allDay = !time;

const localStartDate = new Date(
  allDay
    ? `${date}T12:00:00`
    : `${date}T${time}:00`
);

if (Number.isNaN(localStartDate.getTime())) {
  toast("The event date or time is invalid");
  return;
}

const startDate = localStartDate.toISOString();

    const reminderEnabled = reminderValue !== "";

    const reminderMinutes = reminderEnabled
      ? Number(reminderValue)
      : null;

    const row = {
      household_id: household.id,
      title,
      event_type: eventType,
      start_date: startDate,
      all_day: allDay,
      notes,
      reminder_minutes: reminderMinutes,
      notification_enabled: reminderEnabled,
      notification_sent: false
    };

    let result;

    if (eventId) {
      result = await sb
        .from("calendar_events")
        .update(row)
        .eq("id", eventId)
        .eq("household_id", household.id);
    } else {
      result = await sb
        .from("calendar_events")
        .insert({
          ...row,
          created_by: user.id
        });
    }

    if (
      result.error &&
      String(result.error.message)
        .toLowerCase()
        .includes("created_by")
    ) {
      const fallbackRow = { ...row };

      result = await sb
        .from("calendar_events")
        .insert(fallbackRow);
    }

    if (result.error) {
      toast(result.error.message);
      return;
    }

    this.selectedDate = date;
    this.closeEventForm();

    toast(
      eventId
        ? "Event updated"
        : reminderEnabled
          ? "Event and reminder added"
          : "Event added"
    );

    await this.loadEvents();
  },
  async deleteEvent(eventId) {
    const event = this.events.find(
      item => String(item.id) === String(eventId)
    );

    if (!event) {
      toast("Event could not be found");
      return;
    }

    if (!confirm(`Delete "${event.title || "this event"}"?`)) {
      return;
    }

    const { error } = await sb
      .from("calendar_events")
      .delete()
      .eq("id", eventId)
      .eq("household_id", household.id);

    if (error) {
      toast(error.message);
      return;
    }

    toast("Event deleted");

    await this.loadEvents();
  },

  previousMonth() {
    this.currentMonth--;

    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }

    this.renderCalendar();
  },

  nextMonth() {
    this.currentMonth++;

    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }

    this.renderCalendar();
  },

  goToToday() {
    const now = new Date();

    this.currentMonth = now.getMonth();
    this.currentYear = now.getFullYear();
    this.selectedDate = today();

    this.renderCalendar();
  },

  setFilter(filter, button) {
    this.activeFilter = filter;

    document
      .querySelectorAll(".plannerFilter")
      .forEach(filterButton => {
        filterButton.classList.toggle(
          "active",
          filterButton === button
        );
      });

    this.renderCalendar();
    this.renderUpcomingEvents();
  },

  toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  },

  bindControls() {
    $("prevMonth").addEventListener("click", () => {
      this.previousMonth();
    });

    $("nextMonth").addEventListener("click", () => {
      this.nextMonth();
    });

    $("todayCalendarBtn").addEventListener("click", () => {
      this.goToToday();
    });

    $("plannerAddEventBtn").addEventListener("click", () => {
      this.openEventForm("custom", today());
    });

    $("closeModalBtn").addEventListener("click", () => {
      this.closeDay();
    });

    $("closeDayModalBottomBtn").addEventListener("click", () => {
      this.closeDay();
    });

    $("closePlannerEventBtn")?.addEventListener("click", () => {
      this.closeEventForm();
    });

    $("cancelPlannerEventBtn").addEventListener("click", () => {
      this.closeEventForm();
    });

    $("plannerEventForm").addEventListener("submit", event => {
      this.saveEvent(event);
    });

    $("addMealBtn").addEventListener("click", () => {
      this.openEventForm("meal");
    });

    $("addThawBtn").addEventListener("click", () => {
      this.openEventForm("thaw");
    });

    $("addGroceriesBtn").addEventListener("click", () => {
      this.openEventForm("grocery");
    });

    $("addPracticeBtn").addEventListener("click", () => {
      this.openEventForm("practice");
    });

    $("addBirthdayBtn").addEventListener("click", () => {
      this.openEventForm("birthday");
    });

    $("addBillBtn").addEventListener("click", () => {
      this.openEventForm("bill");
    });

    $("addCustomBtn").addEventListener("click", () => {
      this.openEventForm("custom");
    });

    $("plannerEventModal").addEventListener("click", event => {
      if (event.target === $("plannerEventModal")) {
        this.closeEventForm();
      }
    });

    $("dayModal").addEventListener("click", event => {
      if (event.target === $("dayModal")) {
        this.closeDay();
      }
    });

    document
      .querySelectorAll(".plannerFilter")
      .forEach(button => {
        button.addEventListener("click", () => {
          this.setFilter(
            button.dataset.eventFilter || "all",
            button
          );
        });
      });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      if (!$("plannerEventModal").classList.contains("hidden")) {
        this.closeEventForm();
        return;
      }

      if (!$("dayModal").classList.contains("hidden")) {
        this.closeDay();
      }
    });
  },


 


  initialize() {
    this.bindControls();
    this.renderCalendar();
  }
};


// ============================================================
// CALENDAR COMPATIBILITY FUNCTION
// The main navigation already calls this function.
// ============================================================

async function loadCalendarEvents() {
  await Planner.loadEvents();
}


// ============================================================
// APPLICATION STARTUP
// ============================================================

initTheme();
Planner.initialize();
boot();
// ======================================================
// NOTIFICATIONS AND AUTOMATIC REMINDER ENGINE
// ======================================================

const NotificationManager = {
  reminderTimer: null,
  checkRunning: false,

  // Check reminders every 30 seconds while the app is running.
  checkIntervalMilliseconds: 30 * 1000,

  notificationsSupported() {
    return "Notification" in window;
  },

  notificationsEnabled() {
    return (
      this.notificationsSupported() &&
      Notification.permission === "granted"
    );
  },

  getElements() {
    return {
      statusBadge: document.getElementById(
        "notificationStatusBadge"
      ),

      statusMessage: document.getElementById(
        "notificationStatusMessage"
      ),

      enableButton: document.getElementById(
        "enableNotificationsBtn"
      ),

      testButton: document.getElementById(
        "testNotificationBtn"
      )
    };
  },

  updateNotificationStatus() {
    const {
      statusBadge,
      statusMessage,
      enableButton,
      testButton
    } = this.getElements();

    if (
      !statusBadge ||
      !statusMessage ||
      !enableButton ||
      !testButton
    ) {
      return;
    }

    statusBadge.classList.remove(
      "enabled",
      "disabled"
    );

    if (!this.notificationsSupported()) {
      statusBadge.textContent = "Unavailable";
      statusBadge.classList.add("disabled");

      statusMessage.textContent =
        "This browser does not support notifications.";

      enableButton.textContent =
        "Notifications Unavailable";

      enableButton.disabled = true;
      testButton.disabled = true;
      return;
    }

    if (Notification.permission === "granted") {
      statusBadge.textContent = "Enabled";
      statusBadge.classList.add("enabled");

      statusMessage.textContent =
        "Notifications and automatic calendar reminders are enabled on this device.";

      enableButton.textContent =
        "Notifications Enabled";

      enableButton.disabled = true;
      testButton.disabled = false;
      return;
    }

    if (Notification.permission === "denied") {
      statusBadge.textContent = "Blocked";
      statusBadge.classList.add("disabled");

      statusMessage.textContent =
        "Notifications are blocked. Open your browser or phone settings to allow them.";

      enableButton.textContent =
        "Notifications Blocked";

      enableButton.disabled = true;
      testButton.disabled = true;
      return;
    }

    statusBadge.textContent = "Not Enabled";
    statusBadge.classList.add("disabled");

    statusMessage.textContent =
      "Enable notifications to receive automatic calendar reminders.";

    enableButton.textContent =
      "Enable Notifications";

    enableButton.disabled = false;
    testButton.disabled = true;
  },

async showNotification(
  title,
  message,
  tag = "household-hub"
) {
  if (!sb) {
    throw new Error(
      "Supabase is not connected."
    );
  }

  const {
    data,
    error
  } = await sb.functions.invoke(
    "send-notification",
    {
      body: {
        title,
        message,
        url: window.location.origin
      }
    }
  );

  if (error) {
    console.error(
      "Push notification function failed:",
      error
    );

    throw error;
  }

  if (!data?.success) {
    console.error(
      "Push notification was not accepted:",
      data
    );

    throw new Error(
      data?.error ||
      "The push notification was not accepted."
    );
  }

  console.log(
    "OneSignal push notification sent:",
    {
      title,
      tag,
      messageId:
        data.oneSignalMessageId || null
    }
  );
},

  getEventDateTime(event) {
    if (!event?.start_date) {
      return null;
    }

    const eventDate =
      new Date(event.start_date);

    if (Number.isNaN(eventDate.getTime())) {
      return null;
    }

    return eventDate;
  },

  getReminderDateTime(event) {
    const eventDate =
      this.getEventDateTime(event);

    if (!eventDate) {
      return null;
    }

    if (
      event.reminder_minutes === null ||
      event.reminder_minutes === undefined ||
      event.reminder_minutes === ""
    ) {
      return null;
    }

    const reminderMinutes =
      Number(event.reminder_minutes);

    if (!Number.isFinite(reminderMinutes)) {
      return null;
    }

    return new Date(
      eventDate.getTime() -
      reminderMinutes * 60 * 1000
    );
  },

  formatReminderMessage(event) {
    const type =
      Planner.getTypeInfo(event.event_type);

    const eventDate =
      this.getEventDateTime(event);

    const eventTitle =
      event.title || type.label;

    if (!eventDate) {
      return `${type.icon} ${eventTitle}`;
    }

    const dateText =
      eventDate.toLocaleDateString(
        "en-US",
        {
          weekday: "short",
          month: "short",
          day: "numeric"
        }
      );

    if (event.all_day) {
      return (
        `${type.icon} ${eventTitle}` +
        ` — ${dateText}`
      );
    }

    const timeText =
      eventDate.toLocaleTimeString(
        "en-US",
        {
          hour: "numeric",
          minute: "2-digit"
        }
      );

    return (
      `${type.icon} ${eventTitle}` +
      ` — ${dateText} at ${timeText}`
    );
  },

  reminderIsDue(event, now) {
    if (
      !event.notification_enabled ||
      event.notification_sent
    ) {
      return false;
    }

    const eventDate =
      this.getEventDateTime(event);

    const reminderDate =
      this.getReminderDateTime(event);

    if (!eventDate || !reminderDate) {
      return false;
    }

    const currentTime =
      now.getTime();

    const reminderTime =
      reminderDate.getTime();

    const eventTime =
      eventDate.getTime();

    // Allows a reminder to be caught after the exact
    // reminder minute, up through 10 minutes after
    // the event begins.
    const finalAllowedTime =
      eventTime + 10 * 60 * 1000;

    return (
      currentTime >= reminderTime &&
      currentTime <= finalAllowedTime
    );
  },

async markReminderSent(event) {
  if (!sb || !household || !event?.id) {
    return false;
  }

  const updateResult = await sb
    .from("calendar_events")
    .update({
      notification_sent: true
    })
    .eq("id", event.id)
    .eq("household_id", household.id);

  console.log("Reminder database update:", {
    eventId: event.id,
    error: updateResult.error
  });

  if (updateResult.error) {
    console.error(
      "Could not update reminder:",
      updateResult.error
    );

    return false;
  }

  const verificationResult = await sb
    .from("calendar_events")
    .select("id, notification_sent")
    .eq("id", event.id)
    .eq("household_id", household.id)
    .maybeSingle();

  console.log("Reminder database verification:", {
    eventId: event.id,
    row: verificationResult.data,
    error: verificationResult.error
  });

  if (verificationResult.error) {
    console.error(
      "Could not verify reminder update:",
      verificationResult.error
    );

    return false;
  }

  if (verificationResult.data?.notification_sent !== true) {
    console.error(
      "Database did not save notification_sent as true."
    );

    return false;
  }

  return true;
},
  async resetReminderSent(event) {
    if (
      !sb ||
      !household ||
      !event?.id
    ) {
      return;
    }

    const { error } = await sb
      .from("calendar_events")
      .update({
        notification_sent: false
      })
      .eq("id", event.id)
      .eq(
        "household_id",
        household.id
      );

    if (error) {
      console.error(
        "Could not reset failed reminder:",
        error
      );
    }
  },

  async sendReminder(event) {
    const marked =
      await this.markReminderSent(event);

    if (!marked) {
      return;
    }

    const type =
      Planner.getTypeInfo(event.event_type);

    try {
      await this.showNotification(
        `Reminder: ${event.title || type.label}`,
        this.formatReminderMessage(event),
        `planner-reminder-${event.id}`
      );

      event.notification_sent = true;

      console.log(
        "Automatic reminder sent:",
        event.title
      );
    } catch (error) {
      console.error(
        "Automatic reminder failed:",
        error
      );

      event.notification_sent = false;

      await this.resetReminderSent(event);
    }
  },

async checkReminders() {
  console.log("REMINDER CHECK STARTED:", new Date());

  if (this.checkRunning) {
    console.log("Already running");
    return;
  }

  if (
    !this.notificationsEnabled() ||
    !sb ||
    !household ||
    !Array.isArray(Planner.events)
  ) {
    console.log("Skipped", {
      notificationsEnabled: this.notificationsEnabled(),
      hasSupabase: !!sb,
      hasHousehold: !!household,
      eventCount: Array.isArray(Planner.events)
        ? Planner.events.length
        : 0
    });

    return;
  }

  this.checkRunning = true;

try {
  await Planner.loadEvents();

  const now = new Date();

    console.log("Checking", Planner.events.length, "events");

    const remindersDue =
      Planner.events.filter(event => {
        const due = this.reminderIsDue(event, now);

        console.log(
          event.title,
          "due:",
          due,
          event.start_date
        );

        return due;
      });

    console.log(
      "Due events:",
      remindersDue.map(e => e.title)
    );

    for (const event of remindersDue) {
      console.log("Sending reminder:", event.title);
      await this.sendReminder(event);
    }
  } catch (error) {
    console.error("Reminder check failed:", error);
  } finally {
    this.checkRunning = false;
  }
},
 async requestPermission() {
  if (!this.notificationsSupported()) {
      this.updateNotificationStatus();
      return;
    }

    try {
      const permission =
        await Notification.requestPermission();

      this.updateNotificationStatus();

      if (permission === "granted") {
        await this.showNotification(
          "Household Hub",
          "Notifications and automatic reminders are enabled.",
          "household-hub-enabled"
        );

        await this.checkReminders();
      }
    } catch (error) {
      console.error(
        "Could not enable notifications:",
        error
      );
    }
  },

  async sendTestNotification() {
    try {
      await this.showNotification(
        "Household Hub Test",
        "Your Household Hub notifications are working.",
        "household-hub-test"
      );
    } catch (error) {
      console.error(
        "Test notification failed:",
        error
      );
    }
  },

  startReminderEngine() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
    }

    this.reminderTimer =
      window.setInterval(() => {
        this.checkReminders();
      }, this.checkIntervalMilliseconds);

    window.setTimeout(() => {
      this.checkReminders();
    }, 2000);
  },

  bindControls() {
    const {
      enableButton,
      testButton
    } = this.getElements();

    enableButton?.addEventListener(
      "click",
      () => {
        this.requestPermission();
      }
    );

    testButton?.addEventListener(
      "click",
      () => {
        this.sendTestNotification();
      }
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          this.checkReminders();
        }
      }
    );

    window.addEventListener(
      "focus",
      () => {
        this.checkReminders();
      }
    );

    window.addEventListener(
      "online",
      () => {
        this.checkReminders();
      }
    );
  },

  initialize() {
    this.bindControls();
    this.updateNotificationStatus();

    // Do not start the browser reminder timer. Netlify now checks and sends
    // scheduled reminders from the server so the app can be completely closed.
  }
};

document.addEventListener(
  "DOMContentLoaded",
  () => {
    NotificationManager.initialize();
  }
);
// ============================================================
// AI CALENDAR EVENT CREATOR
// ============================================================

const AICalendar = {
  async createEvent() {
const input = $("aiCalendarCommand");
const button = $("aiCalendarCreateBtn");
const micButton = $("aiCalendarMicBtn");
    const status = $("aiCalendarStatus");

    const command = input.value.trim();

    if (!command) {
      status.textContent = "Enter a calendar command.";
      input.focus();
      return;
    }

    if (!sb || !household || !user) {
      status.textContent = "The household connection is not ready.";
      return;
    }

    button.disabled = true;
    button.textContent = "Creating...";
    status.textContent = "Understanding your request...";

    try {
      const response = await fetch(
        "/.netlify/functions/ai-command",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            command,
            currentDate: Planner.toDateString(new Date())
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success || !result.event) {
        throw new Error(
          result.error || "The AI could not create the event."
        );
      }

      const aiEvent = result.event;

      const title = String(aiEvent.title || "").trim();
      const eventType = Planner.eventTypes[aiEvent.event_type]
        ? aiEvent.event_type
        : "custom";
      const date = String(aiEvent.date || "").slice(0, 10);
      const time = aiEvent.time
        ? String(aiEvent.time).slice(0, 5)
        : "";

      if (!title || !date) {
        throw new Error(
          "The AI response did not include a valid title and date."
        );
      }

      const allDay = Boolean(aiEvent.all_day || !time);

      const localStartDate = new Date(
        allDay
          ? `${date}T12:00:00`
          : `${date}T${time}:00`
      );

      if (Number.isNaN(localStartDate.getTime())) {
        throw new Error("The AI returned an invalid date or time.");
      }

      const reminderMinutes =
        aiEvent.reminder_minutes === null ||
        aiEvent.reminder_minutes === undefined
          ? null
          : Number(aiEvent.reminder_minutes);

      const row = {
        household_id: household.id,
        title,
        event_type: eventType,
        start_date: localStartDate.toISOString(),
        all_day: allDay,
        notes: String(aiEvent.notes || "").trim(),
        reminder_minutes: Number.isFinite(reminderMinutes)
          ? reminderMinutes
          : null,
        notification_enabled:
          Number.isFinite(reminderMinutes),
        notification_sent: false,
        created_by: user.id
      };

      let insertResult = await sb
        .from("calendar_events")
        .insert(row);

      if (
        insertResult.error &&
        String(insertResult.error.message)
          .toLowerCase()
          .includes("created_by")
      ) {
        const fallbackRow = { ...row };
        delete fallbackRow.created_by;

        insertResult = await sb
          .from("calendar_events")
          .insert(fallbackRow);
      }

      if (insertResult.error) {
        throw insertResult.error;
      }

      const eventDate = new Date(`${date}T12:00:00`);

      Planner.currentMonth = eventDate.getMonth();
      Planner.currentYear = eventDate.getFullYear();
      Planner.selectedDate = date;

      await Planner.loadEvents();

      input.value = "";
      status.textContent = `Created: ${title}`;
      toast("Calendar event created");

    } catch (error) {
      console.error("AI calendar creation failed:", error);

      status.textContent =
        error.message || "The event could not be created.";
    } finally {
      button.disabled = false;
      button.textContent = "✨ Create";
    }
  },
startListening() {
  const input = $("aiCalendarCommand");
  const micButton = $("aiCalendarMicBtn");
  const status = $("aiCalendarStatus");

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    status.textContent =
      "Voice input is not supported by this browser.";
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    micButton.disabled = true;
    micButton.textContent = "🎤 Listening...";
    status.textContent = "Speak your calendar command.";
  };

  recognition.onresult = event => {
    const spokenText =
      event.results[0][0].transcript.trim();

    input.value = spokenText;
    status.textContent = `Heard: ${spokenText}`;
  };

  recognition.onerror = event => {
    console.error(
      "Speech recognition error:",
      event.error
    );

    if (event.error === "not-allowed") {
      status.textContent =
        "Microphone permission was not allowed.";
    } else if (event.error === "no-speech") {
      status.textContent =
        "I did not hear anything. Please try again.";
    } else {
      status.textContent =
        "Voice recognition could not understand you.";
    }
  };

  recognition.onend = () => {
    micButton.disabled = false;
    micButton.textContent = "🎤 Speak";
  };

  recognition.start();
},

initialize() {
  const input = $("aiCalendarCommand");
  const button = $("aiCalendarCreateBtn");
  const micButton = $("aiCalendarMicBtn");

  if (!input || !button) return;

  if (micButton) {
    micButton.addEventListener("click", () => {
      this.startListening();
    });
  }

  button.addEventListener("click", () => {
    this.createEvent();
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      this.createEvent();
    }
  });
}
};
AICalendar.initialize();