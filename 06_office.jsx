const OFFICE_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "couriers", label: "Couriers & pickups" },
  { id: "exceptions", label: "Exceptions" },
];

function OfficeView() {
  const [tab, setTab] = useState("dashboard");
  const { state } = useStore();
  const openExCount = state.exceptions.filter((e) => e.status === "open").length;
  return (
    <div>
      <div className="office-tabs">
        {OFFICE_TABS.map((t) => (
          <button key={t.id} className={classNames(t.id === tab && "active")} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "exceptions" && openExCount > 0 && <span className="count">{openExCount}</span>}
          </button>
        ))}
      </div>
      <div className="office-body">
        {tab === "dashboard" && <Dashboard />}
        {tab === "inventory" && <InventoryPanel />}
        {tab === "couriers" && <CouriersPanel />}
        {tab === "exceptions" && <ExceptionsPanel />}
      </div>
    </div>
  );
}

/* ================= Dashboard / Kanban ================= */
function Dashboard() {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [openOrderId, setOpenOrderId] = useState(null);

  const filtered = state.orders.filter((o) => {
    if (priorityOnly && !o.priority) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!o.id.toLowerCase().includes(q) && !o.customer.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const columns = STATUS_FLOW.map((s) => ({
    status: s,
    orders: filtered.filter((o) => o.status === s).sort((a, b) => (b.priority - a.priority) || (a.statusSince - b.statusSince)),
  }));

  const openOrder = state.orders.find((o) => o.id === openOrderId);

  return (
    <div>
      <AttentionPanel onOpen={setOpenOrderId} />
      <div className="filter-bar">
        <input type="text" placeholder="Search order # or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={classNames("chip-toggle", priorityOnly && "active")} onClick={() => setPriorityOnly((v) => !v)}>
          <Icon name="star" size={12} /> Priority only
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-faint)" }}>
          Click any card for full detail
        </span>
      </div>
      <div className="kanban">
        {columns.map((col) => (
          <div className="kanban-col" key={col.status}>
            <div className="kanban-col-head">
              <h3>{STATUS_LABEL[col.status]}</h3>
              <span className="n">{col.orders.length}</span>
            </div>
            <div className="kanban-drop">
              {col.orders.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)", padding: "6px 2px" }}>Nothing here</div>}
              {col.orders.map((o) => <OrderCard key={o.id} order={o} onOpen={() => setOpenOrderId(o.id)} />)}
            </div>
          </div>
        ))}
      </div>
      {openOrder && <OrderDrawer order={openOrder} onClose={() => setOpenOrderId(null)} />}
    </div>
  );
}

function AttentionPanel({ onOpen }) {
  const { state } = useStore();
  const items = attentionItems(state);
  if (items.length === 0) {
    return <div className="panel attention"><div className="attention-head"><h3>Needs attention</h3></div><div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Nothing is late, stalled or flagged right now.</div></div>;
  }
  const shown = items.slice(0, 8);
  return (
    <div className="panel attention">
      <div className="attention-head">
        <h3>Needs attention</h3>
        <span className="n-pill">{items.length}</span>
      </div>
      <div className="attention-list">
        {shown.map(({ order, reasons }) => (
          <button className="attention-row" key={order.id} onClick={() => onOpen(order.id)}>
            <span className="mono aid">{order.id}</span>
            <span className="acust">{order.customer}</span>
            <span className={"chip " + reasons[0].kind}>{reasons[0].label}</span>
            {reasons.length > 1 && <span className="amore">+{reasons.length - 1}</span>}
          </button>
        ))}
      </div>
      {items.length > shown.length && <div className="attention-more">and {items.length - shown.length} more — use the board below</div>}
    </div>
  );
}

function OrderCard({ order, onOpen }) {
  const { state } = useStore();
  const now = state.now;
  const hasOpenEx = state.exceptions.some((e) => e.orderId === order.id && e.status === "open");
  const overdue = order.priority && order.deadline && now > order.deadline && order.status !== "shipped";
  const agingMs = now - order.statusSince;
  const agingWarn = agingMs > 4 * HOUR && order.status !== "shipped";
  return (
    <div
      className={classNames("order-card", order.priority && "is-priority", overdue && "is-overdue")}
      onClick={onOpen}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      {hasOpenEx && <div className="badge-flag" title="Open exception"><Icon name="warning" size={11} /></div>}
      <div className="top-row">
        <span className="oid">{order.id}</span>
        {order.priority && <Icon name="star" size={13} className="pin-star" />}
      </div>
      <div className="customer">{order.customer}</div>
      <div className="meta-row">
        <span className="channel-dot" /><span>{order.channel}</span><span>{order.items.length} item{order.items.length > 1 ? "s" : ""}</span>
      </div>
      <div className="meta-row">
        <span className={classNames("age", agingWarn && "warn")}>{order.status === "shipped" ? "shipped " + fmtDuration(agingMs) + " ago" : fmtDuration(agingMs) + " in " + STATUS_LABEL[order.status].toLowerCase()}</span>
        {order.priority && order.status !== "shipped" && (
          <span className={classNames("age", overdue && "warn")}>
            {overdue ? "deadline missed" : "due " + relFuture(now, order.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ================= Order detail drawer ================= */
function OrderDrawer({ order, onClose }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const products = state.products;
  const stock = orderStockCheck(order, products);
  const courier = state.couriers.find((c) => c.id === order.courierId);
  const exceptions = state.exceptions.filter((e) => e.orderId === order.id);
  const pickedCount = order.items.filter((it) => order.pickedItems[it.productId]).length;
  const packedCount = order.items.filter((it) => order.packedItems[it.productId]).length;

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div>
          <div className="oid mono" style={{ fontSize: 13 }}>{order.id}</div>
          <h3 style={{ fontSize: 20, marginTop: 2 }}>{order.customer}</h3>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 2 }}>{order.channel}, placed {ageLabel(state.now, order.createdAt)}</div>
        </div>
        <button className="drawer-close" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div className="drawer-body">
        <section>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <StatusChip status={order.status} />
            {order.priority && <span className="chip accent"><Icon name="star" size={11} /> Priority</span>}
            {order.priority && order.status !== "shipped" && (
              <span className={classNames("chip", state.now > order.deadline ? "danger" : "neutral")}>
                <Icon name="clock" size={11} /> {state.now > order.deadline ? "Overdue" : "Due " + relFuture(state.now, order.deadline)}
              </span>
            )}
          </div>
          <PipelineStepper status={order.status} />
        </section>

        {exceptions.length > 0 && (
          <section>
            <h4>Exceptions on this order</h4>
            {exceptions.map((e) => (
              <div key={e.id} style={{ fontSize: 13, marginBottom: 6, color: e.status === "open" ? "var(--danger)" : "var(--ink-faint)" }}>
                {exceptionLabel(e.type)} — {e.note} {e.status === "resolved" && "(resolved)"}
              </div>
            ))}
          </section>
        )}

        <section>
          <h4>Items</h4>
          {stock.map((s) => (
            <div className="item-row" key={s.productId}>
              <div className="swatch">{s.product.category[0]}</div>
              <div>
                <div className="name">{s.product.name}</div>
                <div className="variant">{s.product.variant}, <span className="mono">{s.product.sku}</span></div>
              </div>
              <div className="qty">×{s.qty}</div>
              {!s.mainAvail && (order.status === "received" || order.status === "processing") && (
                <span className="chip danger sm" style={{ marginLeft: 6 }}>Only {s.product.mainStock} at Main</span>
              )}
            </div>
          ))}
        </section>

        <section>
          <h4>Shipping</h4>
          {order.status === "received" && (
            <button className="btn primary block" onClick={() => { dispatch({ type: "START_PROCESSING", orderId: order.id }); toast("Order moved to processing."); }}>
              Start processing
            </button>
          )}
          {(order.status === "processing") && (
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>Choose a courier to create the shipping label.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
                {state.couriers.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", fontSize: 13.5, cursor: "pointer" }}>
                    <input type="radio" name="courier" checked={order.courierId === c.id} onChange={() => dispatch({ type: "ASSIGN_COURIER", orderId: order.id, courierId: c.id })} />
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>${c.cost.toFixed(2)}, {c.speedDays}d</span>
                  </label>
                ))}
              </div>
              <button className="btn primary block" disabled={!order.courierId} onClick={() => { dispatch({ type: "SEND_TO_PICKING", orderId: order.id }); toast("Label created — sent to the warehouse for picking."); }}>
                Create label & send to picking
              </button>
              {!order.courierId && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Pick a courier to enable this.</div>}
            </div>
          )}
          {order.status === "picking" && (
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              Waiting on the warehouse — {pickedCount}/{order.items.length} items picked so far.
              <div className="wh-progress" style={{ background: "var(--line)", marginTop: 8 }}>
                <div style={{ background: "var(--accent)", height: "100%", width: (pickedCount / order.items.length) * 100 + "%" }} />
              </div>
            </div>
          )}
          {order.status === "packing" && (
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              At the pack bench — {packedCount}/{order.items.length} items confirmed via <b>{courier ? courier.name : "courier"}</b>.
            </div>
          )}
          {order.status === "staged" && (
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              Staged at <b className="mono">{order.stagingSlot}</b>, waiting for <b>{courier ? courier.name : "courier"}</b> pickup at {order.pickupWindow.label}
              {state.now > order.pickupWindow.cutoff ? <span style={{ color: "var(--danger)", fontWeight: 600 }}> — pickup window has passed</span> : "."}
              <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => { dispatch({ type: "HAND_TO_COURIER", orderId: order.id }); toast("Marked as handed to courier."); }}>
                Mark handed to courier
              </button>
            </div>
          )}
          {order.status === "shipped" && (
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              Shipped via <b>{courier ? courier.name : "courier"}</b> {ageLabel(state.now, order.statusSince)}.
            </div>
          )}
        </section>

        <section>
          <h4>Notes</h4>
          <textarea className="notes-field" placeholder="Add a note for the team…" value={order.notes} onChange={(e) => dispatch({ type: "UPDATE_NOTES", orderId: order.id, notes: e.target.value })} />
        </section>
      </div>
    </Drawer>
  );
}

/* ================= Inventory ================= */
function InventoryPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const rows = [...state.products].sort((a, b) => {
    const rank = { out: 0, low: 1, ok: 2 };
    return rank[stockStatus(a)] - rank[stockStatus(b)];
  });
  return (
    <div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 12, maxWidth: 640 }}>
        Stock only ships from Main. Anything sitting at Warehouse B has to be transferred over before it can be picked — that transfer happens automatically from the warehouse Pick screen when needed, or you can top up manually below to simulate a delivery being shelved.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Location</th><th>Main</th><th>Warehouse B</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const level = stockStatus(p);
              return (
                <tr key={p.id}>
                  <td>{p.name} <span style={{ color: "var(--ink-faint)", marginLeft: 4 }}>{p.variant}</span></td>
                  <td className="sku">{p.sku}</td>
                  <td className="sku">{p.location}</td>
                  <td className="mono">{p.mainStock}</td>
                  <td className="mono">{p.secondaryStock}</td>
                  <td><StockChip level={level} /></td>
                  <td>
                    {level !== "ok" && (
                      <button className="btn sm" onClick={() => { dispatch({ type: "RECEIVE_STOCK", productId: p.id, qty: randInt(8, 16) }); toast("Delivery shelved for " + p.name + "."); }}>
                        Receive delivery
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Couriers & pickups ================= */
function CouriersPanel() {
  const { state } = useStore();
  const staged = state.orders.filter((o) => o.status === "staged" || (o.status === "shipped" && (state.now - o.statusSince) < 12 * HOUR));
  const groups = {};
  staged.forEach((o) => {
    const key = o.courierId + "|" + (o.pickupWindow ? o.pickupWindow.label : "—");
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 22 }}>
        {state.couriers.map((c) => (
          <div className="panel" style={{ padding: 14 }} key={c.id}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginBottom: 8 }}>{c.blurb}</div>
            <div style={{ fontSize: 13 }}>${c.cost.toFixed(2)} per parcel, {c.speedDays}-day delivery</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>Pickup {c.pickups.join(" & ")}</div>
          </div>
        ))}
      </div>
      <h4 style={{ fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 10 }}>Today's pickups</h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Order</th><th>Courier</th><th>Slot</th><th>Window</th><th>Status</th></tr></thead>
          <tbody>
            {Object.entries(groups).flatMap(([key, orders]) => orders).sort((a, b) => a.pickupWindow.cutoff - b.pickupWindow.cutoff).map((o) => {
              const c = state.couriers.find((c) => c.id === o.courierId);
              const missed = o.status === "staged" && state.now > o.pickupWindow.cutoff;
              return (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td>{c ? c.name : "—"}</td>
                  <td className="sku">{o.stagingSlot}</td>
                  <td className="mono">{o.pickupWindow.label}</td>
                  <td>
                    {o.status === "shipped" ? <span className="chip good">Picked up</span> :
                     missed ? <span className="chip danger">Missed</span> :
                     <span className="chip neutral">Waiting</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Exceptions ================= */
function ExceptionsPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState("open");
  const list = state.exceptions
    .filter((e) => filter === "all" || e.status === filter)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="filter-bar">
        {["open", "resolved", "all"].map((f) => (
          <button key={f} className={classNames("chip-toggle", filter === f && "active")} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel" style={{ padding: "4px 16px" }}>
        {list.length === 0 && <div style={{ padding: "30px 4px", color: "var(--ink-faint)", fontSize: 13.5 }}>Nothing to show — no exceptions here.</div>}
        {list.map((e) => (
          <div className={classNames("exception-row", e.status === "resolved" && "resolved")} key={e.id}>
            <div className="ico"><Icon name={e.status === "resolved" ? "check" : "warning"} size={15} /></div>
            <div className="body">
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
                <b style={{ color: "var(--ink)", fontWeight: 600 }}>{exceptionLabel(e.type)}</b>{e.orderId && <span className="mono" style={{ marginLeft: 8 }}>{e.orderId}</span>}<span style={{ marginLeft: 8 }}>reported by {e.reportedBy}</span>
              </div>
              <div className="note">{e.note}</div>
              <div className="meta">{ageLabel(state.now, e.createdAt)}{e.resolvedAt ? ", resolved " + ageLabel(state.now, e.resolvedAt) : ""}</div>
            </div>
            {e.status === "open" && (
              <button className="btn sm" onClick={() => { dispatch({ type: "RESOLVE_EXCEPTION", exceptionId: e.id }); toast("Exception resolved."); }}>
                Resolve
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
