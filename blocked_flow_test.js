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
  click(byText("button", "Warehouse"));
  await sleep(50);
  let sawTransfer = false, sawReport = false, sent = 0;
  const exBefore = document.querySelector(".stat-chip.warn b") ? document.querySelector(".stat-chip.warn b").textContent : "0";
  for (let guard = 0; guard < 60; guard++) {
    // pick everything pickable on the current order
    let progressed = true;
    while (progressed) {
      progressed = false;
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Got it" && !b.disabled);
      if (btn) { click(btn); await sleep(10); progressed = true; }
    }
    const blocked = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Got it" && b.disabled);
    if (blocked) {
      click(byText("button", "Can't find it")); await sleep(15);
      const transfer = byText("button", "Request transfer");
      const report = byText("button", "Report to office");
      if (transfer) {
        sawTransfer = true; click(transfer); await sleep(15);
        // now Got it should be enabled again
        const again = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Got it" && !b.disabled);
        console.log("  transfer path: Got it re-enabled after transfer =", !!again);
        continue;
      }
      if (report) {
        sawReport = true; click(report); await sleep(15);
        const sp = byText("button", "Send to packing");
        console.log("  report path: order stays blocked (Send to packing disabled) =", sp && sp.disabled);
        // skip past this order by jumping tabs won't help; stop the loop here
        break;
      }
      break;
    }
    const sp = byText("button", "Send to packing");
    if (sp && !sp.disabled) { click(sp); sent++; await sleep(15); } else break;
  }
  console.log("orders sent to packing:", sent, "| saw transfer path:", sawTransfer, "| saw report path:", sawReport);
  const exAfter = document.querySelector(".stat-chip.warn b") ? document.querySelector(".stat-chip.warn b").textContent : "0";
  console.log("open exceptions chip:", exBefore, "->", exAfter);
  if (!sawReport) { console.error("FAILED: never reached the true-shortage order"); process.exit(1); }
  process.exit(hadError ? 1 : 0);
}
run().catch((e) => { console.error("TEST THREW:", e.stack || e); process.exit(1); });
