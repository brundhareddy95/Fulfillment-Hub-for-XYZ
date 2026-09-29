const fs = require("fs");
const { JSDOM } = require("jsdom");
const babel = require("@babel/standalone");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
  url: "https://example.com/",
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.MutationObserver = dom.window.MutationObserver;

const errors = [];
dom.window.onerror = (msg) => errors.push(msg);
const consoleIssues = [];
const origError = console.error, origWarn = console.warn;
console.error = (...args) => { consoleIssues.push(["error", args.map(String).join(" ")]); origError(...args); };
console.warn = (...args) => { consoleIssues.push(["warn", args.map(String).join(" ")]); origWarn(...args); };

global.React = require("react");
global.ReactDOM = require("react-dom/client");

const code = fs.readFileSync(require("path").join(__dirname, "..", "dist", "combined.jsx"), "utf8");
const { code: compiled } = babel.transform(code, { presets: ["react"] });

try {
  const fn = new Function(compiled);
  fn.call(global);
  console.log("Initial render: no synchronous throw.");
} catch (e) {
  console.error("RENDER ERROR:", e.stack || e);
  process.exit(1);
}

setTimeout(() => {
  const rootHtml = document.getElementById("root").innerHTML;
  console.log("Root HTML length after tick:", rootHtml.length);
  if (rootHtml.length < 500) {
    console.error("Suspiciously small render output — likely failed silently.");
    console.log(rootHtml);
    process.exit(1);
  }
  // spot-check some expected strings render
  const checks = ["XYZ Fulfillment Hub", "Dashboard", "Received", "Processing", "Picking", "Packing", "Staged", "Shipped", "priority active", "open exception", "Needs attention"];
  let missing = [];
  checks.forEach((c) => {
    if (!rootHtml.includes(c)) missing.push(c);
  });
  if (missing.length) console.warn("MISSING EXPECTED TEXT:", missing);
  ["NaN", "Invalid Date", "undefined"].forEach((bad) => {
    if (rootHtml.includes(bad)) { console.error("BAD VALUE RENDERED:", bad); missing.push("bad:" + bad); }
  });
  if (errors.length) {
    console.error("window.onerror captured:", errors);
  }
  if (consoleIssues.length) {
    console.log("--- console issues during render (" + consoleIssues.length + ") ---");
    consoleIssues.slice(0, 30).forEach((c) => console.log(c[0].toUpperCase(), c[1].slice(0, 200)));
  } else {
    console.log("No console errors/warnings during render.");
  }
  if (errors.length || missing.length) process.exit(1);
  console.log("Smoke test passed.");
  process.exit(0);
}, 500);
