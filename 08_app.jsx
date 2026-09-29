function TopBar({ role, setRole }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const priorityActive = state.orders.filter((o) => o.priority && o.status !== "shipped").length;
  const openEx = state.exceptions.filter((e) => e.status === "open").length;
  // Two-step confirm instead of window.confirm(), which sandboxed/hosted frames can silently block.
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return undefined;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="mark">X</div>
        <div>
          <h1>XYZ Fulfillment Hub</h1>
          <div className="tagline">From order to courier, in one place</div>
        </div>
      </div>

      <div className="role-toggle" role="tablist" aria-label="View">
        <button className={classNames(role === "office" && "active")} onClick={() => setRole("office")}>
          <Icon name="box" size={15} /> Office
        </button>
        <button className={classNames(role === "warehouse" && "active")} onClick={() => setRole("warehouse")}>
          <Icon name="truck" size={15} /> Warehouse
        </button>
      </div>

      <div className="clock-widget" title="Demo clock — fast-forward to watch deadlines and pickups play out">
        <Icon name="clock" size={14} />
        <span className="time">{fmtClock(state.now)}</span>
        <button className="ff-btn" onClick={() => dispatch({ type: "TICK", ms: HOUR })}>+1h</button>
        <button className="ff-btn" onClick={() => dispatch({ type: "TICK", ms: 4 * HOUR })}>+4h</button>
      </div>

      <span className={classNames("stat-chip", priorityActive > 0 && "")}>
        <Icon name="star" size={12} /> <b>{priorityActive}</b> priority active
      </span>
      <span className={classNames("stat-chip", openEx > 0 && "warn")}>
        <Icon name="warning" size={12} /> <b>{openEx}</b> open exception{openEx === 1 ? "" : "s"}
      </span>

      <button className="reset-link" onClick={() => {
        if (!confirmReset) { setConfirmReset(true); return; }
        setConfirmReset(false);
        dispatch({ type: "RESET_DEMO" });
        toast("Demo data reset to the starting sample.");
      }}>
        {confirmReset ? "Click again to reset" : "Reset demo"}
      </button>
    </div>
  );
}

function Root() {
  const [state, dispatch] = useReducer(reducer, null, () => loadState() || buildInitialState());
  const [role, setRole] = useState("office");

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    dispatch({ type: "TICK", ms: 0 });
    const id = setInterval(() => dispatch({ type: "TICK", ms: 2 * MIN }), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, []);

  return (
    <StoreCtx.Provider value={{ state, dispatch }}>
      <ToastProvider>
        <div className={classNames("app-shell", role === "warehouse" && "is-wh")}>
          <TopBar role={role} setRole={setRole} />
          {role === "office" ? <OfficeView /> : <WarehouseView />}
        </div>
      </ToastProvider>
    </StoreCtx.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Root />);
