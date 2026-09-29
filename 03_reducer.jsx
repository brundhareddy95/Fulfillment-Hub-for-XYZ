/* ============================================================
   Reducer: the whole fulfillment lifecycle lives here so both
   the Office and Warehouse views act on one source of truth.
   ============================================================ */

function computePickupCutoff(now, courier) {
  const [h, m] = pick(courier.pickups).split(":").map(Number);
  let d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d = new Date(d.getTime() + 24 * HOUR);
  return { label: h + ":" + String(m).padStart(2, "0"), cutoff: d.getTime() };
}

function withHistory(order, status, at) {
  return { ...order, status, statusSince: at, history: [...order.history, { status, at }] };
}

function flagMissedPickups(state) {
  let exceptions = state.exceptions;
  let seq = state.nextExceptionSeq;
  const orders = state.orders.map((o) => {
    if (o.status === "staged" && o.pickupWindow && !o.pickupMissedFlagged && state.now > o.pickupWindow.cutoff) {
      exceptions = [...exceptions, {
        id: "EX" + seq++, orderId: o.id, type: "missed_pickup",
        note: "Pickup window (" + o.pickupWindow.label + ") passed while the box was still in staging.",
        reportedBy: "system", status: "open", createdAt: state.now, resolvedAt: null,
      }];
      return { ...o, pickupMissedFlagged: true };
    }
    return o;
  });
  return { ...state, orders, exceptions, nextExceptionSeq: seq };
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_STATE":
      return action.state;

    case "TICK": {
      const next = { ...state, now: state.now + action.ms };
      return flagMissedPickups(next);
    }

    case "RESET_DEMO":
      return buildInitialState();

    case "START_PROCESSING": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId && o.status === "received" ? withHistory(o, "processing", state.now) : o
      );
      return flagMissedPickups({ ...state, orders });
    }

    case "ASSIGN_COURIER": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId ? { ...o, courierId: action.courierId } : o
      );
      return { ...state, orders };
    }

    case "SEND_TO_PICKING": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId && o.courierId ? withHistory(o, "picking", state.now) : o
      );
      return flagMissedPickups({ ...state, orders });
    }

    case "PICK_ITEM": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const item = order.items.find((it) => it.productId === action.productId);
      const products = state.products.map((p) =>
        p.id === action.productId ? { ...p, mainStock: Math.max(0, p.mainStock - item.qty) } : p
      );
      const orders = state.orders.map((o) =>
        o.id === action.orderId
          ? { ...o, pickedItems: { ...o.pickedItems, [action.productId]: true } }
          : o
      );
      return { ...state, orders, products };
    }

    case "REQUEST_TRANSFER": {
      const products = state.products.map((p) => {
        if (p.id !== action.productId) return p;
        const move = Math.min(p.secondaryStock, action.qty);
        return { ...p, mainStock: p.mainStock + move, secondaryStock: p.secondaryStock - move };
      });
      return { ...state, products };
    }

    case "RECEIVE_STOCK": {
      const products = state.products.map((p) =>
        p.id === action.productId ? { ...p, mainStock: p.mainStock + action.qty } : p
      );
      return { ...state, products };
    }

    case "REPORT_EXCEPTION": {
      const ex = {
        id: "EX" + state.nextExceptionSeq, orderId: action.orderId || null, type: action.excType,
        note: action.note || "", reportedBy: action.reportedBy || "warehouse",
        status: "open", createdAt: state.now, resolvedAt: null,
      };
      return { ...state, exceptions: [...state.exceptions, ex], nextExceptionSeq: state.nextExceptionSeq + 1 };
    }

    case "RESOLVE_EXCEPTION": {
      const exceptions = state.exceptions.map((e) =>
        e.id === action.exceptionId ? { ...e, status: "resolved", resolvedAt: state.now, resolution: action.resolution || "" } : e
      );
      return { ...state, exceptions };
    }

    case "SEND_TO_PACKING": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId ? withHistory(o, "packing", state.now) : o
      );
      return flagMissedPickups({ ...state, orders });
    }

    case "TOGGLE_PACK_ITEM": {
      const orders = state.orders.map((o) => {
        if (o.id !== action.orderId) return o;
        const nextVal = !o.packedItems[action.productId];
        const flags = { ...(o.wrongItemFlags || {}) };
        if (nextVal) delete flags[action.productId];
        return { ...o, packedItems: { ...o.packedItems, [action.productId]: nextVal }, wrongItemFlags: flags };
      });
      return { ...state, orders };
    }

    case "FLAG_WRONG_ITEM": {
      const order = state.orders.find((o) => o.id === action.orderId);
      const product = state.products.find((p) => p.id === action.productId);
      const orders = state.orders.map((o) =>
        o.id === action.orderId
          ? {
              ...o,
              packedItems: { ...o.packedItems, [action.productId]: false },
              wrongItemFlags: { ...(o.wrongItemFlags || {}), [action.productId]: true },
            }
          : o
      );
      const ex = {
        id: "EX" + state.nextExceptionSeq, orderId: action.orderId, type: "wrong_item",
        note: "Wrong item caught at the pack bench for " + (product ? product.name + " (" + product.variant + ")" : "an item") + " — sent back to be re-picked.",
        reportedBy: "warehouse", status: "open", createdAt: state.now, resolvedAt: null,
      };
      return { ...state, orders, exceptions: [...state.exceptions, ex], nextExceptionSeq: state.nextExceptionSeq + 1 };
    }

    case "MARK_PACKED": {
      let slot = state.nextSlotSeq || 1;
      const orders = state.orders.map((o) => {
        if (o.id !== action.orderId) return o;
        const courier = state.couriers.find((c) => c.id === o.courierId);
        const pickupWindow = computePickupCutoff(state.now, courier);
        const staged = withHistory(o, "staged", state.now);
        return { ...staged, stagingSlot: "S-" + String(slot).padStart(2, "0"), pickupWindow, pickupMissedFlagged: false };
      });
      const nextSlotSeq = (slot % 24) + 1;
      return flagMissedPickups({ ...state, orders, nextSlotSeq });
    }

    case "HAND_TO_COURIER": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId ? withHistory(o, "shipped", state.now) : o
      );
      return { ...state, orders };
    }

    case "UPDATE_NOTES": {
      const orders = state.orders.map((o) =>
        o.id === action.orderId ? { ...o, notes: action.notes } : o
      );
      return { ...state, orders };
    }

    default:
      return state;
  }
}
