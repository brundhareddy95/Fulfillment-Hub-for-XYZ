const fs = require("fs");
const { JSDOM } = require("jsdom");
const babel = require("@babel/standalone");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  url: "https://example.com/", pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.MutationObserver = dom.window.MutationObserver;
global.confirm = () => true;
dom.window.confirm = () => true;

let hadError = false;
dom.window.onerror = (msg) => { hadError = true; console.error("window.onerror:", msg); };
const origError = console.error;
console.error = (...a) => { origError(...a); if (String(a[0]).includes("Warning")) return; };

global.React = require("react");
global.ReactDOM = require("react-dom/client");

const code = fs.readFileSync(require("path").join(__dirname, "..", "dist", "combined.jsx"), "utf8");
const { code: compiled } = babel.transform(code, { presets: ["react"] });
new Function(compiled).call(global);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function click(el) { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }
function byText(tag, text) {
  return Array.from(document.querySelectorAll(tag)).find((e) => e.textContent.trim() === text || e.textContent.trim().startsWith(text));
}
function allByText(tag, text) {
  return Array.from(document.querySelectorAll(tag)).filter((e) => e.textContent.includes(text));
}

async function run() {
  await sleep(200);
  console.log("STEP: switch to Warehouse view");
  click(byText("button", "Warehouse"));
  await sleep(50);

  console.log("STEP: pick flow — click every 'Got it' until queue advances or none left");
  for (let i = 0; i < 40; i++) {
    const gotIt = byText("button", "Got it");
    if (!gotIt) break;
    click(gotIt);
    await sleep(20);
  }
  console.log("  remaining 'Got it' buttons:", allByText("button", "Got it").length);

  console.log("STEP: trigger a 'Can't find it' -> transfer or report path if present");
  const cantFind = byText("button", "Can't find it");
  if (cantFind) {
    click(cantFind);
    await sleep(20);
    const transferBtn = byText("button", "Request transfer");
    const reportBtn = byText("button", "Report to office");
    if (transferBtn) { click(transferBtn); console.log("  requested transfer"); }
    else if (reportBtn) { click(reportBtn); console.log("  reported to office"); }
    await sleep(20);
  } else {
    console.log("  (no blocked item encountered in this run)");
  }

  console.log("STEP: send an order to packing if possible");
  const sendPacking = byText("button", "Send to packing");
  if (sendPacking && !sendPacking.disabled) { click(sendPacking); await sleep(30); console.log("  sent to packing"); }
  else console.log("  send-to-packing not ready (expected if an item is blocked)");

  console.log("STEP: go to Pack tab and pack an order");
  click(byText("button", "Pack"));
  await sleep(30);
  for (let i = 0; i < 6; i++) {
    const cards = document.querySelectorAll(".wh-item-card");
    if (!cards.length) break;
    let unchecked = Array.from(cards).find((c) => !c.classList.contains("done"));
    if (!unchecked) break;
    click(unchecked);
    await sleep(20);
  }
  const printLabel = byText("button", "Print label");
  if (printLabel && !printLabel.disabled) {
    click(printLabel);
    await sleep(30);
    const markPacked = byText("button", "Mark packed & staged");
    if (markPacked) { click(markPacked); await sleep(30); console.log("  packed & staged"); }
  } else {
    console.log("  print label not enabled (queue may have been empty)");
  }

  console.log("STEP: go to Stage & ship, hand one order to courier");
  click(byText("button", "Stage & ship"));
  await sleep(30);
  const handTo = byText("button", "Handed to courier");
  if (handTo) { click(handTo); await sleep(20); console.log("  handed to courier"); }
  else console.log("  nothing staged to hand off");

  console.log("STEP: report a problem from the floor");
  click(byText("button", "Report a problem"));
  await sleep(20);
  const missingStockBtn = allByText("button", "Missing stock")[0];
  if (missingStockBtn) click(missingStockBtn);
  await sleep(20);
  const submit = byText("button", "Submit report");
  if (submit) { click(submit); await sleep(20); console.log("  problem reported:", !!byText("div", "Reported")); }

  console.log("STEP: switch to Office, open Exceptions, resolve one");
  click(byText("button", "Office"));
  await sleep(30);
  click(byText("button", "Exceptions"));
  await sleep(30);
  const resolveBtn = byText("button", "Resolve");
  if (resolveBtn) { click(resolveBtn); await sleep(20); console.log("  resolved an exception"); }
  else console.log("  no open exceptions to resolve (unexpected)");

  console.log("STEP: Inventory receive delivery");
  click(byText("button", "Inventory"));
  await sleep(30);
  const receiveBtn = byText("button", "Receive delivery");
  if (receiveBtn) { click(receiveBtn); await sleep(20); console.log("  received a delivery"); }

  console.log("STEP: open an order drawer from Dashboard and close it");
  click(byText("button", "Dashboard"));
  await sleep(30);
  const firstCard = document.querySelector(".order-card");
  if (firstCard) {
    click(firstCard);
    await sleep(30);
    const closeBtn = document.querySelector(".drawer-close");
    if (closeBtn) { click(closeBtn); console.log("  opened & closed drawer"); }
  }

  console.log("STEP: fast-forward clock +4h twice");
  const ff = allByText("button", "+4h")[0];
  if (ff) { click(ff); click(ff); await sleep(30); console.log("  clock advanced"); }

  await sleep(50);
  if (hadError) { console.error("FAILED: window.onerror fired during interactions"); process.exit(1); }
  console.log("\nAll interaction steps completed without a thrown error.");
  process.exit(0);
}

run().catch((e) => { console.error("TEST THREW:", e.stack || e); process.exit(1); });
