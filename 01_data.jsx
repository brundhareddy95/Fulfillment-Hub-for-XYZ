/* ============================================================
   XYZ Fulfillment Hub — data layer
   Seeded sample data so the demo looks the same on every load,
   plus a small virtual clock so delays/missed pickups can be
   demonstrated without waiting in real time.
   ============================================================ */

// ---- seeded RNG (mulberry32) so demo data is reproducible ----
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260926);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

const PRODUCTS_SEED = [
  ["Harbor Canvas Tote", "HCT-BLK", "Black", "Bags", "B2"],
  ["Harbor Canvas Tote", "HCT-SND", "Sand", "Bags", "B2"],
  ["Ridgeline Water Bottle", "RWB-24-GRN", "24oz / Green", "Drinkware", "A1"],
  ["Ridgeline Water Bottle", "RWB-24-SLT", "24oz / Slate", "Drinkware", "A1"],
  ["Ridgeline Water Bottle", "RWB-32-SLT", "32oz / Slate", "Drinkware", "A1"],
  ["Cascade Fleece Pullover", "CFP-M-NVY", "M / Navy", "Apparel", "C4"],
  ["Cascade Fleece Pullover", "CFP-L-NVY", "L / Navy", "Apparel", "C4"],
  ["Cascade Fleece Pullover", "CFP-L-OLV", "L / Olive", "Apparel", "C4"],
  ["Cascade Fleece Pullover", "CFP-XL-OLV", "XL / Olive", "Apparel", "C4"],
  ["Basecamp Enamel Mug", "BEM-12-BLU", "12oz / Blue", "Drinkware", "A3"],
  ["Basecamp Enamel Mug", "BEM-12-RED", "12oz / Red", "Drinkware", "A3"],
  ["Trailhead Notebook", "TNB-DOT", "Dot grid", "Stationery", "D1"],
  ["Trailhead Notebook", "TNB-LND", "Lined", "Stationery", "D1"],
  ["Summit Beanie", "SB-CHR", "Charcoal", "Apparel", "C1"],
  ["Summit Beanie", "SB-RST", "Rust", "Apparel", "C1"],
  ["Basecamp Enamel Plate Set", "BEP-SET4", "Set of 4", "Kitchen", "A4"],
  ["Ridgeline Sling Pack", "RSP-BLK", "Black", "Bags", "B1"],
  ["Cascade Rain Shell", "CRS-M-YLW", "M / Yellow", "Apparel", "C5"],
];

function buildProducts() {
  return PRODUCTS_SEED.map(([name, sku, variant, category, aisle], i) => {
    // A handful of products are deliberately tight on stock at Main so the
    // transfer-from-Warehouse-B flow has something real to show.
    const tight = [1, 6, 10, 15].includes(i);
    const out = [15].includes(i);
    const main = out ? 0 : tight ? randInt(0, 2) : randInt(8, 60);
    const secondary = out || tight ? randInt(3, 14) : randInt(0, 20);
    return {
      id: "P" + (i + 1),
      name, sku, variant, category,
      location: aisle + "-" + (10 + i),
      mainStock: main,
      secondaryStock: secondary,
      reorder: 6,
    };
  });
}

const COURIERS = [
  { id: "CR1", name: "Speedy Express", cost: 8.5, speedDays: 1, pickups: ["12:30", "16:30"], blurb: "Next-day, priciest" },
  { id: "CR2", name: "MetroCourier", cost: 6.0, speedDays: 2, pickups: ["14:00"], blurb: "Two-day, balanced" },
  { id: "CR3", name: "ValueShip", cost: 3.75, speedDays: 4, pickups: ["17:00"], blurb: "Cheapest, slowest" },
];

const CHANNELS = ["Marketplace", "XYZ Website", "Social Shop"];
const FIRST = ["Amara", "Leo", "Priya", "Noah", "Yuki", "Diego", "Freya", "Sam", "Ines", "Tomas", "Maya", "Owen", "Zara", "Kian", "Elin", "Rosa", "Jin", "Nora"];
const LAST = ["Chen", "Okafor", "Lindqvist", "Park", "Silva", "Kowalski", "Haddad", "Reyes", "Novak", "Bianchi", "Sato", "Murphy"];

function randomCustomer() { return pick(FIRST) + " " + pick(LAST); }
function randomItems(products) {
  const n = randInt(1, 3);
  const chosen = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let p = pick(products);
    let guard = 0;
    while (used.has(p.id) && guard++ < 10) p = pick(products);
    used.add(p.id);
    chosen.push({ productId: p.id, qty: randInt(1, 3) });
  }
  return chosen;
}

let orderSeq = 10381;
let slotCounter = 0;
function nextSeedSlot() { return "S-" + String((slotCounter++ % 24) + 1).padStart(2, "0"); }
function nextOrderId() { return "XYZ-" + orderSeq++; }

// STATUS_FLOW mirrors the physical pipeline in the brief.
const STATUS_FLOW = ["received", "processing", "picking", "packing", "staged", "shipped"];
const STATUS_LABEL = {
  received: "Received", processing: "Processing", picking: "Picking",
  packing: "Packing", staged: "Staged", shipped: "Shipped",
};

function makeOrder(products, { status, ageHours, statusAgeHours, priority, courierId, withException, pickupPassed, needsTransfer, deadlineHours }) {
  const now = Date.now();
  const createdAt = now - ageHours * HOUR - randInt(0, 40) * MIN;
  // How long the order has sat in ITS CURRENT status — independent of total age,
  // since an order can be old overall but just arrived in this status. Callers
  // that want to demonstrate a stall (the "delays go unnoticed" problem) pass
  // statusAgeHours explicitly; everything else gets a modest, varied default.
  const effectiveStatusAge = statusAgeHours != null ? statusAgeHours : Math.min(ageHours, 0.2 + rng() * 1.6);
  const order = {
    id: nextOrderId(),
    channel: pick(CHANNELS),
    customer: randomCustomer(),
    items: randomItems(products),
    priority: !!priority,
    status,
    createdAt,
    statusSince: now - effectiveStatusAge * HOUR,
    courierId: courierId || null,
    deadline: priority ? createdAt + (deadlineHours != null ? deadlineHours : randInt(6, 10)) * HOUR : null,
    stagingSlot: null,
    pickupWindow: null,
    pickupMissedFlagged: false,
    pickedItems: {},
    packedItems: {},
    notes: "",
    history: [{ status: "received", at: createdAt }],
  };
  if (["picking", "packing", "staged", "shipped"].includes(status)) {
    order.courierId = courierId || pick(COURIERS).id;
  }
  if (status === "packing" || status === "staged" || status === "shipped") {
    order.items.forEach((it) => { order.pickedItems[it.productId] = true; });
  }
  if (status === "staged" || status === "shipped") {
    order.items.forEach((it) => { order.packedItems[it.productId] = true; });
  }
  if (status === "staged" || status === "shipped") {
    order.stagingSlot = nextSeedSlot();
    // Pickup windows are set relative to "now" so the demo looks right at any
    // time of day: upcoming ones are 30-240 min away, missed ones 20-90 min ago.
    const cutoffMs = pickupPassed ? now - randInt(20, 90) * MIN : now + randInt(30, 240) * MIN;
    const cd = new Date(cutoffMs);
    order.pickupWindow = { label: cd.getHours() + ":" + String(cd.getMinutes()).padStart(2, "0"), cutoff: cutoffMs };
    if (status === "shipped") {
      const shippedCutoff = createdAt + randInt(2, 20) * HOUR;
      const sd = new Date(shippedCutoff);
      order.pickupWindow = { label: sd.getHours() + ":" + String(sd.getMinutes()).padStart(2, "0"), cutoff: shippedCutoff };
    }
  }
  order._seedException = withException || null;
  order._needsTransfer = !!needsTransfer;
  return order;
}

function buildOrders(products) {
  const orders = [];
  const specs = [
    // status, count, priority-count-within, extra
    ...Array(7).fill({ status: "received", ageHours: 0.3 }),
    { status: "received", ageHours: 0.4, priority: true },
    ...Array(5).fill({ status: "processing", ageHours: 1 }),
    { status: "processing", ageHours: 5.5, statusAgeHours: 5.2, priority: true, deadlineHours: 7 }, // stuck without a courier — aging, at risk
    ...Array(8).fill({ status: "picking", ageHours: 2 }),
    { status: "picking", ageHours: 1, statusAgeHours: 0.8, priority: true, needsTransfer: true, deadlineHours: 6 }, // priority order whose stock sits in Warehouse B
    { status: "picking", ageHours: 8.5, statusAgeHours: 6.5, priority: true, deadlineHours: 7 }, // overdue on arrival, sitting a long time
    { status: "picking", ageHours: 3, statusAgeHours: 2.5, withException: "missing_stock" },
    ...Array(5).fill({ status: "packing", ageHours: 3 }),
    { status: "packing", ageHours: 5, statusAgeHours: 4.3, priority: true, deadlineHours: 8 }, // aging in packing too
    ...Array(6).fill({ status: "staged", ageHours: 4 }),
    { status: "staged", ageHours: 3, priority: true },
    { status: "staged", ageHours: 5, withException: "misplaced_box" },
    { status: "staged", ageHours: 6, pickupPassed: true }, // will auto-flag missed pickup on load
    ...Array(12).fill({ status: "shipped", ageHours: 30 }),
  ];
  specs.forEach((spec) => orders.push(makeOrder(products, spec)));

  // The "missing stock" demo order must reflect a REAL shortage, not a random
  // one: swap in the scarce product and ask for more than both warehouses hold.
  const scarce = products[15];
  const shortOrder = orders.find((o) => o._seedException === "missing_stock");
  if (shortOrder) {
    const rest = shortOrder.items.filter((it) => it.productId !== scarce.id).slice(0, 1);
    shortOrder.items = [{ productId: scarce.id, qty: scarce.mainStock + scarce.secondaryStock + 2 }, ...rest];
  }

  // Priority order that needs a stock transfer: Main is short by 2, Warehouse B has plenty.
  const transferProduct = products[6];
  const transferOrder = orders.find((o) => o._needsTransfer);
  if (transferOrder) {
    const rest = transferOrder.items.filter((it) => it.productId !== transferProduct.id).slice(0, 1);
    transferOrder.items = [{ productId: transferProduct.id, qty: transferProduct.mainStock + 2 }, ...rest];
  }
  orders.forEach((o) => { delete o._needsTransfer; });
  return orders;
}

function buildExceptions(orders, products) {
  const exceptions = [];
  let seq = 1;
  const now = Date.now();
  orders.forEach((o) => {
    if (o._seedException === "missing_stock") {
      const item = o.items[0];
      const p = products.find((pr) => pr.id === item.productId);
      exceptions.push({
        id: "EX" + seq++, orderId: o.id, type: "missing_stock",
        note: p.name + " (" + p.variant + ") short by " + Math.max(1, item.qty - p.mainStock - p.secondaryStock) + " unit(s) — not enough at Main or Warehouse B.",
        reportedBy: "warehouse", status: "open", createdAt: now - randInt(20, 90) * MIN, resolvedAt: null,
      });
    }
    if (o._seedException === "misplaced_box") {
      exceptions.push({
        id: "EX" + seq++, orderId: o.id, type: "misplaced_box",
        note: "Box isn't in its staging slot — being searched for before the courier arrives.",
        reportedBy: "warehouse", status: "open", createdAt: now - randInt(10, 60) * MIN, resolvedAt: null,
      });
    }
    delete o._seedException;
  });
  // one resolved exception for history/context
  const shippedOrder = orders.find((o) => o.status === "shipped");
  if (shippedOrder) {
    exceptions.push({
      id: "EX" + seq++, orderId: shippedOrder.id, type: "wrong_item",
      note: "Wrong variant was pulled during picking; caught at packing and corrected.",
      reportedBy: "warehouse", status: "resolved", createdAt: now - 26 * HOUR, resolvedAt: now - 25 * HOUR,
    });
  }
  return exceptions;
}

function buildInitialState() {
  const products = buildProducts();
  const orders = buildOrders(products);
  const exceptions = buildExceptions(orders, products);
  return {
    products, orders, exceptions, couriers: COURIERS,
    now: Date.now(),
    nextSlotSeq: (slotCounter % 24) + 1,
    nextExceptionSeq: exceptions.length + 1,
    createdAt: Date.now(),
  };
}
