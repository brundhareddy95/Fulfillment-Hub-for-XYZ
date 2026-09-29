# XYZ Fulfillment Hub

A small app that lets XYZ see, run and protect its order fulfillment process, replacing the spreadsheet plus shared folder.

## Run it locally

No install needed for the app itself.

1. Open `index.html` in a browser (or run `npx serve .` in this folder and open the URL).
2. It needs internet once, to load React, Babel and fonts from public CDNs.

All data is invented sample data, generated on first load and kept in your browser's localStorage. **Reset demo** (top right) restores the starting state.

To rebuild `index.html` from `src/` and run the tests: `npm install && npm test`.

## A 60-second tour

The top bar switches between the two people who use this app.

- **Office** (desktop): a board of every order by stage, with a **Needs attention** list on top (missed priority deadlines, missed courier pickups, stalled orders, open exceptions). Click any card for the order detail, courier choice and label step.
- **Warehouse** (phone or tablet): one order at a time, one obvious button per step. Pick, then Pack, then Stage & ship, plus a **Report a problem** tab that is always one tap away.
- **Demo clock** (top bar, `+1h` / `+4h`): jump time forward to watch deadlines slip and pickups get missed, without waiting real hours. Time also drifts forward slowly by itself.

## How I read the problem

The seven complaints in the brief look separate, but they come from three underlying gaps:

| Underlying gap | Complaints it produces | What the app does |
|---|---|---|
| **Nobody can see the whole pipeline** | Can't see status at a glance; delays go unnoticed; priority orders get mixed in | One board by stage. Priority orders always sort first, carry a deadline, and are flagged when at risk or late. Every order shows how long it has sat in its current stage. The **Needs attention** list turns "someone should notice" into a ranked to-do list. |
| **The system's picture of the warehouse drifts from reality** | Stock can't be found; wrong product or variant shipped; boxes misplaced | Picking is confirmed item by item, showing name, variant and shelf location, so a worker can't "pick" something Main doesn't hold. If Main is short, the app checks Warehouse B and offers a transfer, or reports a true shortage. Packing re-confirms each SKU, with a "not the right item?" escape hatch that catches errors before the box is sealed. Each staged box gets a unique slot. |
| **Problems live in people's heads** | Problems handled informally and forgotten; courier misses pickup | One **Exceptions** log. Workers report in two taps, the system raises its own (a staged box past its pickup window is flagged automatically), and each stays open until someone resolves it. |

### What I chose not to build, and why

- **Real courier and marketplace integrations, label PDFs, tracking.** Not available here, and they don't change whether the workflow is right. The label is a preview.
- **Logins and multi-user sync.** The hard part of this brief is the workflow and how it feels on the warehouse floor, not accounts. State is per browser.
- **Barcode scanning.** The obvious next step for the wrong-item problem. Today a tap stands in for a scan; the screens already show the SKU a scan would check.
- **Analytics and returns.** Useful later, but none of the stated pain points need them.

## Design decisions worth knowing

- **Two modes that look different on purpose.** The warehouse team is experienced but not tech-comfortable, so their screen has big targets, dark high-contrast colours chosen for legibility at arm's length, no menus, and only the current task. The office gets a denser board. Sharing one UI would have compromised both.
- **Exceptions are objects, not a status.** An order stays in the stage where it physically is and carries a flag, so the board always reflects where the box actually is.
- **A blocked order stays visibly blocked.** If stock is genuinely missing, the order can't move to packing, appears in Needs attention, and stays there until the office resolves it (for example by receiving a delivery from the Inventory tab).
- **The seed data is a story, not random noise.** On first load there is a priority order that is already late, a priority order needing a Warehouse B transfer, an order with a true shortage, a box missing from staging, and a courier pickup that has already been missed.

## Code layout

```
src/            React app split by concern (data, helpers, reducer, ui, office, warehouse, app)
build.sh        concatenates src/ into one self-contained index.html
tests/          unit tests for the lifecycle and stock logic, plus headless UI tests
```

State lives in a single reducer, so the Office and Warehouse views always act on the same source of truth.

## Tests

`npm test` runs four suites: reducer unit tests (stock transfer, missed-pickup detection exactly once, full order lifecycle, wrong-item flow, unique staging slots), a headless render check that also fails on `NaN`, `Invalid Date` or `undefined` appearing in the UI, a click-through of both views, and a targeted test of the two blocked-item paths.

## Known limitations

- The Office board is built for desktop; it stacks on a phone but is not optimised for it.
- Warehouse B transfers complete instantly. A real transfer takes time and would need its own "in transit" state.
- Pickup windows for boxes packed during a session use each courier's fixed daily times.
- Sample data uses invented courier and channel names; nothing here refers to a real company.
