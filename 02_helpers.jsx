/* ============================================================
   Helpers: persistence + time formatting
   ============================================================ */

const STORAGE_KEY = "xyz-fulfillment-hub-v1";

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.orders) || typeof parsed.now !== "number") return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage unavailable — demo still works in-memory for this session */
  }
}

function fmtClock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m";
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return hrs + "h" + (rem ? " " + rem + "m" : "");
  const days = Math.floor(hrs / 24);
  return days + "d " + (hrs % 24) + "h";
}

// Positive = time remaining, negative = overdue
function timeUntil(now, ts) { return ts - now; }

function ageLabel(now, since) { return now - since < MIN ? "just now" : fmtDuration(now - since) + " ago"; }

function relFuture(now, ts) {
  const d = ts - now;
  if (d <= 0) return fmtDuration(-d) + " overdue";
  return "in " + fmtDuration(d);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function classNames(...xs) { return xs.filter(Boolean).join(" "); }

function stockStatus(p) {
  const total = p.mainStock + p.secondaryStock;
  if (p.mainStock <= 0 && p.secondaryStock <= 0) return "out";
  if (p.mainStock <= p.reorder) return "low";
  return "ok";
}

function orderStockCheck(order, products) {
  // returns array of {productId, product, qty, mainAvail, secondaryAvail, short}
  return order.items.map((it) => {
    const p = products.find((pr) => pr.id === it.productId);
    return {
      productId: it.productId,
      product: p,
      qty: it.qty,
      mainAvail: p.mainStock >= it.qty,
      secondaryAvail: p.secondaryStock >= it.qty,
      short: p.mainStock + p.secondaryStock < it.qty,
    };
  });
}

const EXCEPTION_TYPES = [
  { id: "missing_stock", label: "Missing stock", icon: "\u26A0" },
  { id: "wrong_item", label: "Wrong item", icon: "\u21C4" },
  { id: "misplaced_box", label: "Box misplaced", icon: "\u2591" },
  { id: "missed_pickup", label: "Missed pickup", icon: "\u23F1" },
  { id: "other", label: "Other", icon: "\u2022" },
];
function exceptionLabel(type) {
  const t = EXCEPTION_TYPES.find((x) => x.id === type);
  return t ? t.label : "Other";
}

// Everything the office should look at first, most urgent first. One row per
// order, with its most severe reason leading.
function attentionItems(state) {
  const now = state.now;
  const out = [];
  state.orders.forEach((o) => {
    if (o.status === "shipped") return;
    const reasons = [];
    if (o.priority && o.deadline && now > o.deadline) reasons.push({ sev: 0, kind: "danger", label: "Priority deadline missed" });
    if (o.status === "staged" && o.pickupWindow && now > o.pickupWindow.cutoff) reasons.push({ sev: 1, kind: "danger", label: "Courier pickup missed" });
    if (state.exceptions.some((e) => e.orderId === o.id && e.status === "open")) reasons.push({ sev: 2, kind: "danger", label: "Open exception" });
    if (o.priority && o.deadline && now <= o.deadline && o.deadline - now < 2 * HOUR) reasons.push({ sev: 3, kind: "accent", label: "Priority due in " + fmtDuration(o.deadline - now) });
    if (now - o.statusSince > 4 * HOUR) reasons.push({ sev: 4, kind: "neutral", label: "Stalled " + fmtDuration(now - o.statusSince) + " in " + STATUS_LABEL[o.status].toLowerCase() });
    if (reasons.length) {
      reasons.sort((a, b) => a.sev - b.sev);
      out.push({ order: o, reasons });
    }
  });
  return out.sort((a, b) => (a.reasons[0].sev - b.reasons[0].sev) || (b.order.priority - a.order.priority));
}
