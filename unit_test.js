const fs = require("fs");
const vm = require("vm");

const files = ["01_data.jsx", "02_helpers.jsx", "03_reducer.jsx"];
const code = files.map((f) => fs.readFileSync(require("path").join(__dirname, "..", "src", f), "utf8")).join("\n") + "\nmodule.exports = { buildInitialState, reducer, HOUR, MIN, attentionItems };";
const sandbox = { window: { localStorage: { getItem: () => null, setItem: () => {} } }, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "reducer-bundle.js" });
const { buildInitialState, reducer, HOUR, MIN, attentionItems } = sandbox.module.exports;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); failures++; }
  else console.log("ok  -", msg);
}

// ---- Scenario 1: missing-stock order can't be picked, transfer fixes it ----
let state = buildInitialState();
const missingOrder = state.orders.find((o) => state.exceptions.some((e) => e.orderId === o.id && e.type === "missing_stock"));
assert(!!missingOrder, "seed includes an order with a pre-flagged missing_stock exception");
if (missingOrder) {
  const item = missingOrder.items[0];
  const product = state.products.find((p) => p.id === item.productId);
  assert(product.mainStock + product.secondaryStock < item.qty, "that product genuinely can't cover the order even combined");

  // Bump secondary stock so a transfer becomes viable, then request it.
  state.products = state.products.map((p) => p.id === product.id ? { ...p, secondaryStock: p.secondaryStock + 10 } : p);
  const before = state.products.find((p) => p.id === product.id).mainStock;
  state = reducer(state, { type: "REQUEST_TRANSFER", productId: product.id, qty: item.qty });
  const afterProduct = state.products.find((p) => p.id === product.id);
  assert(afterProduct.mainStock >= item.qty, "after transfer, Main has enough to cover the order (" + afterProduct.mainStock + " >= " + item.qty + ")");

  state = reducer(state, { type: "PICK_ITEM", orderId: missingOrder.id, productId: product.id });
  const pickedOrder = state.orders.find((o) => o.id === missingOrder.id);
  assert(pickedOrder.pickedItems[product.id] === true, "item is now marked picked");
  assert(state.products.find((p) => p.id === product.id).mainStock === afterProduct.mainStock - item.qty, "Main stock decremented by the picked quantity");
}

// ---- Scenario 2: staged order past its pickup window auto-flags exactly once ----
state = buildInitialState();
const stagedLate = state.orders.find((o) => o.status === "staged" && o.pickupWindow && o.pickupWindow.cutoff < state.now && !o.pickupMissedFlagged);
assert(!!stagedLate, "seed includes a staged order whose pickup window has already passed");
if (stagedLate) {
  const exBefore = state.exceptions.filter((e) => e.type === "missed_pickup").length;
  state = reducer(state, { type: "TICK", ms: 0 });
  const exAfter1 = state.exceptions.filter((e) => e.type === "missed_pickup").length;
  assert(exAfter1 === exBefore + 1, "exactly one missed_pickup exception created on first tick (" + exBefore + " -> " + exAfter1 + ")");
  state = reducer(state, { type: "TICK", ms: 5 * MIN });
  const exAfter2 = state.exceptions.filter((e) => e.type === "missed_pickup").length;
  assert(exAfter2 === exAfter1, "no duplicate exception created on a second tick (still " + exAfter2 + ")");
  const flagged = state.orders.find((o) => o.id === stagedLate.id);
  assert(flagged.pickupMissedFlagged === true, "order itself is marked pickupMissedFlagged");
}

// ---- Scenario 3: full happy-path lifecycle for a fresh 'received' order ----
state = buildInitialState();
const fresh = state.orders.find((o) => o.status === "received");
assert(!!fresh, "seed includes at least one 'received' order");
if (fresh) {
  state = reducer(state, { type: "START_PROCESSING", orderId: fresh.id });
  assert(state.orders.find((o) => o.id === fresh.id).status === "processing", "received -> processing");

  const blocked = reducer(state, { type: "SEND_TO_PICKING", orderId: fresh.id });
  assert(blocked.orders.find((o) => o.id === fresh.id).status === "processing", "cannot advance to picking without a courier assigned");

  state = reducer(state, { type: "ASSIGN_COURIER", orderId: fresh.id, courierId: state.couriers[0].id });
  state = reducer(state, { type: "SEND_TO_PICKING", orderId: fresh.id });
  assert(state.orders.find((o) => o.id === fresh.id).status === "picking", "processing -> picking once courier is set");

  let order = state.orders.find((o) => o.id === fresh.id);
  order.items.forEach((it) => { state = reducer(state, { type: "PICK_ITEM", orderId: fresh.id, productId: it.productId }); });
  state = reducer(state, { type: "SEND_TO_PACKING", orderId: fresh.id });
  assert(state.orders.find((o) => o.id === fresh.id).status === "packing", "picking -> packing once all items picked");

  order = state.orders.find((o) => o.id === fresh.id);
  order.items.forEach((it) => { state = reducer(state, { type: "TOGGLE_PACK_ITEM", orderId: fresh.id, productId: it.productId }); });
  state = reducer(state, { type: "MARK_PACKED", orderId: fresh.id });
  order = state.orders.find((o) => o.id === fresh.id);
  assert(order.status === "staged", "packing -> staged");
  assert(!!order.stagingSlot && !!order.pickupWindow, "staged order gets a slot and a pickup window");

  state = reducer(state, { type: "HAND_TO_COURIER", orderId: fresh.id });
  order = state.orders.find((o) => o.id === fresh.id);
  assert(order.status === "shipped", "staged -> shipped");
  assert(order.history.map((h) => h.status).join(",") === "received,processing,picking,packing,staged,shipped", "history records the full pipeline in order");
}

// ---- Scenario 4: wrong-item flag at packing sends the item back and logs an exception ----
state = buildInitialState();
const packingOrder = state.orders.find((o) => o.status === "packing");
if (packingOrder) {
  const it = packingOrder.items[0];
  const exBefore = state.exceptions.filter((e) => e.type === "wrong_item").length;
  state = reducer(state, { type: "FLAG_WRONG_ITEM", orderId: packingOrder.id, productId: it.productId });
  const o = state.orders.find((x) => x.id === packingOrder.id);
  assert(o.packedItems[it.productId] === false, "flagged item is un-packed");
  assert(o.wrongItemFlags && o.wrongItemFlags[it.productId] === true, "item carries a wrong-item flag for the UI to show");
  assert(state.exceptions.filter((e) => e.type === "wrong_item").length === exBefore + 1, "a wrong_item exception was logged");
}

// ---- Scenario 5: attention list surfaces the seeded problems, most severe first ----
state = reducer(buildInitialState(), { type: "TICK", ms: 0 });
const att = attentionItems(state);
console.log("     attention rows:", att.map((a) => a.order.id + " [" + a.reasons.map((r) => r.label).join(" | ") + "]").join("\n                    "));
assert(att.length >= 5, "attention list has several rows on first load (" + att.length + ")");
assert(att[0].reasons[0].sev === 0, "most severe reason (missed priority deadline) is listed first");
assert(att.some((a) => a.reasons.some((r) => r.label === "Courier pickup missed")), "missed courier pickup is surfaced");
assert(att.some((a) => a.reasons.some((r) => r.label.startsWith("Stalled"))), "a stalled order is surfaced");
assert(att.some((a) => a.reasons.some((r) => r.label.startsWith("Priority due in"))), "an at-risk (due soon) priority order is surfaced");
const advanced = reducer(state, { type: "TICK", ms: 4 * HOUR });
assert(attentionItems(advanced).length >= att.length, "fast-forwarding 4h never makes things look healthier (" + attentionItems(advanced).length + ")");

// ---- Scenario 6: no two staged boxes share a staging slot ----
const slots = buildInitialState().orders.filter((o) => o.status === "staged").map((o) => o.stagingSlot);
assert(new Set(slots).size === slots.length, "every staged box has a unique staging slot (" + slots.join(",") + ")");

console.log(failures === 0 ? "\nALL UNIT TESTS PASSED" : "\n" + failures + " UNIT TEST(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
