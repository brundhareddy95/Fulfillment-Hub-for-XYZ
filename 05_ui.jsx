const { useState, useEffect, useRef, useMemo, useReducer, createContext, useContext } = React;

/* ---------- icons (small hand-drawn set, no icon font) ---------- */
function Icon({ name, size = 16, className }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className };
  switch (name) {
    case "star": return <svg {...common} fill="currentColor" stroke="none"><path d="M12 2.5l2.9 6.3 6.8.7-5.1 4.6 1.5 6.7L12 17.6 5.9 20.8l1.5-6.7-5.1-4.6 6.8-.7z" /></svg>;
    case "warning": return <svg {...common}><path d="M12 3.5 2 20.5h20L12 3.5Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none" /></svg>;
    case "clock": return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "check": return <svg {...common}><path d="M4 12.5l5 5L20 6.5" /></svg>;
    case "x": return <svg {...common}><path d="M5 5l14 14M19 5L5 19" /></svg>;
    case "truck": return <svg {...common}><rect x="1.5" y="7" width="13" height="9" rx="1" /><path d="M14.5 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.7" /><circle cx="17.5" cy="18" r="1.7" /></svg>;
    case "box": return <svg {...common}><path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" /><path d="M3 7.5v9L12 21l9-4.5v-9" /><path d="M12 12v9" /></svg>;
    case "search": return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "chevronRight": return <svg {...common}><path d="m9 5 7 7-7 7" /></svg>;
    case "chevronDown": return <svg {...common}><path d="m5 8 7 7 7-7" /></svg>;
    case "swap": return <svg {...common}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
    case "note": return <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h6M9 16h6M9 8h3" /></svg>;
    case "shield": return <svg {...common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>;
    case "map": return <svg {...common}><path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2Z" /><path d="M9 4.5v13M15 6.5v13" /></svg>;
    default: return null;
  }
}

/* ---------- shared store context ---------- */
const StoreCtx = createContext(null);
function useStore() { return useContext(StoreCtx); }

/* ---------- toasts ---------- */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => <div className="toast" key={t.id}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast() { return useContext(ToastCtx); }

/* ---------- status chip ---------- */
function StatusChip({ status }) {
  const kind = status === "shipped" ? "good" : status === "received" ? "neutral" : "info";
  return <span className={"chip " + kind}>{STATUS_LABEL[status]}</span>;
}

function StockChip({ level }) {
  if (level === "out") return <span className="chip danger">Out of stock</span>;
  if (level === "low") return <span className="chip accent">Low stock</span>;
  return <span className="chip good">In stock</span>;
}

/* ---------- drawer shell ---------- */
function Drawer({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <React.Fragment>
      <div className="overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true">{children}</div>
    </React.Fragment>
  );
}

/* ---------- pipeline stepper (a real sequence, so numbering is earned) ---------- */
function PipelineStepper({ status }) {
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <div className="stepper">
      {STATUS_FLOW.map((s, i) => (
        <div key={s} className={classNames("step", i < idx && "done", i === idx && "current")}>
          <div className="bar" />
          <div className="dot">{i < idx ? <Icon name="check" size={11} /> : i + 1}</div>
          <div className="label">{STATUS_LABEL[s]}</div>
        </div>
      ))}
    </div>
  );
}
