const WH_TABS = [
  { id: "pick", label: "Pick" },
  { id: "pack", label: "Pack" },
  { id: "stage", label: "Stage & ship" },
  { id: "report", label: "Report a problem" },
];

function WarehouseView() {
  const { state } = useStore();
  const [tab, setTab] = useState("pick");
  const pickCount = state.orders.filter((o) => o.status === "picking").length;
  const packCount = state.orders.filter((o) => o.status === "packing").length;
  const missedCount = state.orders.filter((o) => o.status === "staged" && state.now > o.pickupWindow.cutoff).length;
  const counts = { pick: pickCount, pack: packCount, stage: missedCount };

  return (
    <div className="wh-shell">
      <div className="wh-segment">
        {WH_TABS.map((t) => (
          <button key={t.id} className={classNames(t.id === tab && "active", t.id === "report" && "report")} onClick={() => setTab(t.id)}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {t.label}
              {t.id === "stage" && missedCount > 0 && <span className="badge-dot">{missedCount}</span>}
            </span>
            {(t.id === "pick" || t.id === "pack") && <span style={{ fontSize: 11, color: "#7C8480" }}>{counts[t.id]} waiting</span>}
          </button>
        ))}
      </div>
      <div className="wh-body">
        {tab === "pick" && <PickFlow />}
        {tab === "pack" && <PackFlow />}
        {tab === "stage" && <StageFlow />}
        {tab === "report" && <ReportProblemFlow />}
      </div>
    </div>
  );
}

function useQueue(status) {
  const { state } = useStore();
  const queue = state.orders
    .filter((o) => o.status === status)
    .sort((a, b) => (b.priority - a.priority) || (a.statusSince - b.statusSince));
  const [currentId, setCurrentId] = useState(queue[0] ? queue[0].id : null);
  useEffect(() => {
    if (!queue.find((o) => o.id === currentId)) setCurrentId(queue[0] ? queue[0].id : null);
    // eslint-disable-next-line
  }, [queue.map((o) => o.id).join(",")]);
  const index = queue.findIndex((o) => o.id === currentId);
  const current = queue[index] || queue[0] || null;
  return { queue, current, index: Math.max(index, 0) };
}

/* ================= Pick ================= */
function PickFlow() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const { queue, current, index } = useQueue("picking");
  const [openIssueFor, setOpenIssueFor] = useState(null);

  if (!current) {
    return (
      <div className="wh-empty">
        <div className="big-emoji">📦</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#F4F4F0" }}>Nothing to pick right now</div>
        <div style={{ marginTop: 4 }}>New orders will show up here once the office creates a label.</div>
      </div>
    );
  }

  const overdue = current.priority && current.deadline && state.now > current.deadline;
  const allDone = current.items.every((it) => current.pickedItems[it.productId]);

  return (
    <div>
      <div className="wh-queue-head">
        <span className="of">Order {index + 1} of {queue.length}</span>
        {current.priority && <span className={classNames("wh-pill", overdue ? "overdue" : "priority")}><Icon name="star" size={12} /> {overdue ? "Overdue" : "Priority"}</span>}
      </div>
      <div className="wh-order-title">{current.customer}</div>
      <div className="wh-order-sub mono">{current.id}, {current.items.length} item{current.items.length > 1 ? "s" : ""}
        {current.priority && !overdue && ", due " + relFuture(state.now, current.deadline)}
      </div>
      <div className="wh-progress">
        <div style={{ width: (current.items.filter((it) => current.pickedItems[it.productId]).length / current.items.length) * 100 + "%" }} />
      </div>

      {current.items.map((it) => {
        const p = state.products.find((pr) => pr.id === it.productId);
        const done = !!current.pickedItems[it.productId];
        const openIssue = openIssueFor === it.productId;
        const needed = it.qty;
        const shortBy = Math.max(0, needed - p.mainStock);
        const insufficient = shortBy > 0;
        const canTransfer = !done && shortBy > 0 && p.secondaryStock >= shortBy;
        const trulyShort = !done && shortBy > 0 && p.secondaryStock < shortBy;
        return (
          <div className={classNames("wh-item-card", done && "done")} key={it.productId}>
            <div className="head">
              <div>
                <div className="pname">{p.name}</div>
                <div className="pvariant">{p.variant}</div>
                <div className="wh-loc-chip"><Icon name="map" size={13} /> {p.location}</div>
              </div>
              <div className="pqty">×{needed}<span>needed</span></div>
            </div>
            {!done && (
              <div className="wh-actions">
                <button className="wh-btn go wide" disabled={insufficient} onClick={() => { dispatch({ type: "PICK_ITEM", orderId: current.id, productId: it.productId }); setOpenIssueFor(null); }}>
                  <Icon name="check" size={18} /> Got it
                </button>
                <button className="wh-btn ghost" onClick={() => setOpenIssueFor(openIssue ? null : it.productId)}>Can't find it</button>
              </div>
            )}
            {!done && insufficient && !openIssue && (
              <div style={{ color: "#F0B79C", fontSize: 13, marginTop: 8 }}>Only {p.mainStock} at Main right now — tap "Can't find it" to check Warehouse B.</div>
            )}
            {done && <div style={{ color: "#57C79A", fontSize: 14, marginTop: 10, fontWeight: 600 }}><Icon name="check" size={14} /> Picked</div>}
            {openIssue && canTransfer && (
              <div className="wh-inline-alert">
                {p.secondaryStock} in stock at Warehouse B. Request a transfer, then come back and confirm.
                <div className="cta">
                  <button className="wh-btn go" onClick={() => { dispatch({ type: "REQUEST_TRANSFER", productId: p.id, qty: shortBy }); toast("Transfer requested from Warehouse B."); setOpenIssueFor(null); }}>
                    <Icon name="swap" size={16} /> Request transfer
                  </button>
                </div>
              </div>
            )}
            {openIssue && trulyShort && (
              <div className="wh-inline-alert">
                Not enough anywhere: {p.mainStock} at Main + {p.secondaryStock} at Warehouse B, but {needed} needed.
                <div className="cta">
                  <button className="wh-btn go" onClick={() => {
                    dispatch({ type: "REPORT_EXCEPTION", orderId: current.id, excType: "missing_stock", reportedBy: "warehouse", note: p.name + " (" + p.variant + ") short by " + shortBy + " unit(s) — not enough at Main or Warehouse B." });
                    toast("Reported to the office.");
                    setOpenIssueFor(null);
                  }}>
                    <Icon name="warning" size={16} /> Report to office
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button className="wh-btn go big" style={{ width: "100%", marginTop: 6 }} disabled={!allDone} onClick={() => { dispatch({ type: "SEND_TO_PACKING", orderId: current.id }); toast("Sent to packing."); }}>
        Send to packing <Icon name="chevronRight" size={18} />
      </button>
      {!allDone && <div style={{ textAlign: "center", color: "#7C8480", fontSize: 13, marginTop: 8 }}>Confirm or report every item to continue.</div>}
    </div>
  );
}

/* ================= Pack ================= */
function PackFlow() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const { queue, current, index } = useQueue("packing");
  const [showLabel, setShowLabel] = useState(false);

  if (!current) {
    return (
      <div className="wh-empty">
        <div className="big-emoji">🏷️</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#F4F4F0" }}>No orders waiting to be packed</div>
        <div style={{ marginTop: 4 }}>Picked orders will land here next.</div>
      </div>
    );
  }
  const courier = state.couriers.find((c) => c.id === current.courierId);
  const allPacked = current.items.every((it) => current.packedItems[it.productId]);

  if (showLabel) {
    return (
      <div>
        <div className="wh-queue-head">
          <span className="of">Label preview</span>
          <button className="wh-btn ghost" onClick={() => setShowLabel(false)}><Icon name="x" size={16} /></button>
        </div>
        <div className="label-preview">
          <div className="lrow"><span>SHIP VIA</span><span>{courier ? courier.name.toUpperCase() : ""}</span></div>
          <div className="lto">{current.customer}<br />123 Fictional Ave, Sample City</div>
          <div className="lrow"><span>ORDER</span><span>{current.id}</span></div>
          <div className="lrow"><span>WEIGHT</span><span>{(current.items.reduce((s, it) => s + it.qty, 0) * 0.4).toFixed(1)} kg</span></div>
          <div className="barcode">
            {Array.from({ length: 96 }).map((_, i) => (
              <span key={i} style={{ width: [1, 2, 1, 3, 1, 1, 2, 1][i % 8] + "px" }} />
            ))}
          </div>
          <div className="lid">{current.id.replace("-", "")}</div>
        </div>
        <button className="wh-btn go big" style={{ width: "100%", marginTop: 16 }} onClick={() => { dispatch({ type: "MARK_PACKED", orderId: current.id }); toast("Packed — moved to staging."); setShowLabel(false); }}>
          <Icon name="box" size={18} /> Mark packed & staged
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="wh-queue-head">
        <span className="of">Order {index + 1} of {queue.length}</span>
        {current.priority && <span className="wh-pill priority"><Icon name="star" size={12} /> Priority</span>}
      </div>
      <div className="wh-order-title">{current.customer}</div>
      <div className="wh-order-sub mono">{current.id}, ships via {courier ? courier.name : "courier"}</div>

      {current.items.map((it) => {
        const p = state.products.find((pr) => pr.id === it.productId);
        const checked = !!current.packedItems[it.productId];
        const flagged = current.wrongItemFlags && current.wrongItemFlags[it.productId];
        return (
          <div className={classNames("wh-item-card", checked && "done")} key={it.productId} style={{ cursor: "pointer" }} onClick={() => dispatch({ type: "TOGGLE_PACK_ITEM", orderId: current.id, productId: it.productId })}>
            <div className="head">
              <div>
                <div className="pname">{p.name}</div>
                <div className="pvariant mono">{p.sku}, {p.variant}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="pqty">×{it.qty}</div>
                <div style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid " + (checked ? "#57C79A" : "#3C464A"), background: checked ? "#57C79A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#14181A" }}>
                  {checked && <Icon name="check" size={16} />}
                </div>
              </div>
            </div>
            {flagged && <div className="wh-inline-alert" style={{ marginTop: 10 }}>Flagged as a wrong item earlier — check the shelf again before ticking this off.</div>}
            {!checked && !flagged && (
              <button className="wh-btn ghost" style={{ marginTop: 10, width: "100%" }} onClick={(e) => { e.stopPropagation(); dispatch({ type: "FLAG_WRONG_ITEM", orderId: current.id, productId: it.productId }); toast("Flagged — sent back to be re-picked."); }}>
                Not the right item?
              </button>
            )}
          </div>
        );
      })}

      <button className="wh-btn go big" style={{ width: "100%", marginTop: 6 }} disabled={!allPacked} onClick={() => setShowLabel(true)}>
        <Icon name="note" size={18} /> Print label
      </button>
      {!allPacked && <div style={{ textAlign: "center", color: "#7C8480", fontSize: 13, marginTop: 8 }}>Tap each item to confirm it's the right one.</div>}
    </div>
  );
}

/* ================= Stage & ship ================= */
function StageFlow() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const staged = state.orders.filter((o) => o.status === "staged").sort((a, b) => a.pickupWindow.cutoff - b.pickupWindow.cutoff);

  if (staged.length === 0) {
    return (
      <div className="wh-empty">
        <div className="big-emoji">🚚</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#F4F4F0" }}>Nothing staged right now</div>
        <div style={{ marginTop: 4 }}>Packed boxes waiting for pickup will show up here.</div>
      </div>
    );
  }

  const groups = [];
  staged.forEach((o) => {
    const c = state.couriers.find((c) => c.id === o.courierId);
    const key = (c ? c.name : "Courier") + ", pickup " + o.pickupWindow.label;
    let g = groups.find((g) => g.key === key);
    if (!g) { g = { key, orders: [] }; groups.push(g); }
    g.orders.push(o);
  });

  return (
    <div>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="pickup-group-head"><h4>{g.key}</h4><div className="line" /></div>
          {g.orders.map((o) => {
            const missed = state.now > o.pickupWindow.cutoff;
            return (
              <div className="wh-panel" key={o.id}>
                <div className="row1 stack">
                  <div>
                    <div className="oid">{o.id}</div>
                    <div className="customer">{o.customer}</div>
                    <div className="sub">Slot {o.stagingSlot}, {missed ? <span style={{ color: "#FF6A4D", fontWeight: 600 }}>pickup window passed</span> : "pickup " + relFuture(state.now, o.pickupWindow.cutoff)}</div>
                  </div>
                  <button className="wh-btn go block" onClick={() => { dispatch({ type: "HAND_TO_COURIER", orderId: o.id }); toast("Handed to courier."); }}>
                    <Icon name="truck" size={17} /> Handed to courier
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ================= Report a problem ================= */
const PROBLEM_TYPES = [
  { id: "missing_stock", label: "Missing stock", emoji: "📦" },
  { id: "wrong_item", label: "Wrong item", emoji: "🔀" },
  { id: "misplaced_box", label: "Box misplaced", emoji: "🔎" },
  { id: "other", label: "Something else", emoji: "✏️" },
];

function ReportProblemFlow() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState(null);
  const [search, setSearch] = useState("");
  const [orderId, setOrderId] = useState(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const matches = search.trim().length > 0
    ? state.orders.filter((o) => o.status !== "shipped" && (o.id.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase()))).slice(0, 5)
    : [];

  function reset() { setType(null); setSearch(""); setOrderId(null); setNote(""); setSent(false); }

  if (sent) {
    return (
      <div className="wh-empty">
        <div className="big-emoji">✅</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#F4F4F0" }}>Reported</div>
        <div style={{ marginTop: 4 }}>The office can see this now.</div>
        <button className="wh-btn go" style={{ marginTop: 18, display: "inline-flex" }} onClick={reset}>Report another</button>
      </div>
    );
  }

  return (
    <div>
      <div className="wh-order-title" style={{ marginBottom: 14 }}>What went wrong?</div>
      <div className="wh-type-grid">
        {PROBLEM_TYPES.map((t) => (
          <button key={t.id} className={classNames("wh-type-btn", type === t.id && "selected")} onClick={() => setType(t.id)}>
            <span className="emoji">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {type && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: "#A9B0AC", fontSize: 13.5, marginBottom: 6 }}>Which order? (optional)</div>
          <input className="wh-search" placeholder="Search order # or customer" value={orderId ? orderId : search} onFocus={() => setOrderId(null)} onChange={(e) => { setSearch(e.target.value); setOrderId(null); }} />
          {!orderId && matches.map((o) => (
            <div key={o.id} className="wh-pick-suggestion" onClick={() => { setOrderId(o.id); setSearch(o.id); }} style={{ cursor: "pointer" }}>
              <span>{o.customer} <span className="mono" style={{ color: "#7C8480" }}>{o.id}</span></span>
              <Icon name="chevronRight" size={16} />
            </div>
          ))}

          <div style={{ color: "#A9B0AC", fontSize: 13.5, margin: "14px 0 6px" }}>Add a note (optional)</div>
          <textarea className="wh-textarea" placeholder="What did you notice?" value={note} onChange={(e) => setNote(e.target.value)} />

          <button className="wh-btn go big" style={{ width: "100%", marginTop: 16 }} onClick={() => {
            dispatch({ type: "REPORT_EXCEPTION", orderId: orderId, excType: type, reportedBy: "warehouse", note: note.trim() || PROBLEM_TYPES.find((t) => t.id === type).label + " reported from the floor." });
            toast("Reported to the office.");
            setSent(true);
          }}>
            <Icon name="warning" size={18} /> Submit report
          </button>
        </div>
      )}
    </div>
  );
}
