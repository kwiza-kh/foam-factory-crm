# Storyboard

**Format:** 1920x1080  
**Duration:** 20 seconds target  
**Audio:** Kokoro TTS voiceover, low electronic operations pulse, crisp UI ticks  
**VO direction:** calm confident product narrator, fast but clear, factory-ops urgency without hype  
**Style basis:** DESIGN.md, captured CRM screenshots, exact dark UI palette

## Global Direction

The promo should feel like a live command center waking up: dark panels, blue selection states, table rows sliding into alignment, and real screenshots moving in 3D space. The screenshots are the hero assets, not background decoration. Motion is purposeful: grids scan, rows count, tabs snap active, delivery rows isolate, and the closing line resolves into a single clean product promise.

## Asset Audit

| Asset | Type | Assign to Beat | Role |
| --- | --- | --- | --- |
| `capture/screenshots/scroll-000-dashboard.png` | Screenshot | Beat 1, Beat 5 | Full product cockpit opener and closer |
| `capture/screenshots/orders-grid.png` | Screenshot | Beat 2 | Main order follow-up workbench |
| `capture/screenshots/production-kanban.png` | Screenshot | Beat 3 | Production planning and schedule proof |
| `capture/screenshots/deliveries-grid.png` | Screenshot | Beat 4 | Delivery-note workflow proof |
| `capture/screenshots/statistics-panel.png` | Screenshot | Beat 4 | Statement/accounting workflow proof |
| `../../public/favicon.svg` | SVG | Beat 1, Beat 5 | Brand mark opener and closer |

## BEAT 1 - SPREADSHEET PRESSURE (0.00-3.20s)

**VO cue:** "Factory orders don't wait."

**Concept:** The viewer starts inside a dark factory data cockpit. The real CRM dashboard floats forward out of darkness, while thin spreadsheet-like grid lines sweep behind it and collapse into the actual app UI. The product is immediately visible and credible.

**Visual description:** A full-screen `scroll-000-dashboard.png` appears in perspective, slightly tilted, with the left sidebar and metric strip readable. Ghost table lines in the background drift horizontally. The FOAM OPS brand mark locks into the upper left. A red urgency line pulses once across the lower third, echoing the captured overdue-order banner.

**Mood direction:** operational, focused, high-signal; a factory floor control room translated into software.

**Assets:** dashboard screenshot full frame, favicon brand mark.

**Animation choreography:** dashboard PUSHES forward from scale 0.92 to 1.02; grid lines DRAW across the background; brand mark SNAPS into place; red alert line PULSES once; headline words CASCADE in above the screenshot.

**Techniques:** CSS 3D transforms, SVG path drawing, per-word kinetic typography.

**Transition:** zoom-through into Beat 2, 0.35s, blur 10px, `power3.inOut`.

**Depth layers:** BG grid and glows; MG dashboard screenshot; FG brand mark, alert line, kinetic type.

**SFX:** low pulse starts immediately, light UI tick as the dashboard lands.

## BEAT 2 - ONE COMMAND CENTER (3.20-9.10s)

**VO cue:** "Foam Factory CRM brings customers, orders, production, delivery, and payments into one command center."

**Concept:** The order grid becomes a hub. Workflow labels orbit the real table like modules snapping into the same operating system.

**Visual description:** `orders-grid.png` fills most of the frame in a laptop-like perspective panel. Five blue chips appear around it: Customers, Orders, Production, Deliveries, Payments. Connector lines draw from each chip back to the tab rail in the screenshot. The table rows subtly scroll upward, implying scale without losing readability.

**Mood direction:** precise and modular; one place for every operational workflow.

**Assets:** orders grid screenshot.

**Animation choreography:** screenshot SLIDES in from the right; module chips DROP into positions with stagger; connectors DRAW outward; row highlight SWEEPS across the table; the screenshot slowly ZOOMS 1.00 to 1.035.

**Techniques:** SVG path drawing, perspective screenshot treatment, staggered UI chips.

**Transition:** velocity-matched push left into Beat 3, 0.35s, blur 12px.

**Depth layers:** BG dark panel glow; MG order grid; FG blue workflow chips and drawn connectors.

**SFX:** five soft ticks as chips land.

## BEAT 3 - LIVE COUNTS (9.10-16.10s)

**VO cue:** "Track four thousand six hundred twenty one open orders, fifty four thousand yuan in value, and twenty three delivery notes."

**Concept:** Real operational numbers take the stage. The dashboard metrics separate from the screenshot and become large animated counters, while the production schedule grid sits behind them as proof.

**Visual description:** `production-kanban.png` sits as a wide, dark workbench in the background. Three large counters stack in the foreground: 4,621 Open Orders, ¥54,141.79 Order Value, 23 Delivery Notes. Each number counts up quickly and locks with a blue underline. Thin vertical scan bars travel through the grid behind them.

**Mood direction:** data confidence, no-nonsense scale.

**Assets:** production schedule screenshot.

**Animation choreography:** background grid RISES into view; counters COUNT UP from zero; underlines DRAW left-to-right; scan bars GLIDE across table columns; small status dots PULSE in red, amber, green.

**Techniques:** counter animation, Canvas-style scanline pattern in CSS, SVG line drawing.

**Transition:** fast staggered-block cover into Beat 4, 0.28s.

**Depth layers:** BG production screenshot; MG counters; FG status dots and blue underlines.

**SFX:** three count locks, then a short digital shutter.

## BEAT 4 - ACTION NOW (16.10-18.20s)

**VO cue:** "See what needs action now."

**Concept:** The promo shifts from scale to action. Delivery and statement workflows split the frame, showing dispatch and accounting surfaces side by side.

**Visual description:** `deliveries-grid.png` slides into the left side with the delivery row highlighted. `statistics-panel.png` slides into the right side with the statement table empty-state and add statement action visible. The two panels tilt toward each other, joined by a bright blue path that travels from import to delivery to statement.

**Mood direction:** active, practical, decisive.

**Assets:** delivery grid screenshot, statistics/accounting screenshot.

**Animation choreography:** left panel WHIPS in; right panel COUNTER-WHIPS in; delivery row HIGHLIGHTS with a blue sweep; the connecting path DRAWS across both panels; CTA phrase "action now" STAMPS in red/blue.

**Techniques:** split-screen compositing, SVG path drawing, kinetic emphasis.

**Transition:** blur crossfade into Beat 5, 0.55s, `sine.inOut`.

**Depth layers:** BG dark canvas and soft blue glow; MG two screenshots; FG path line and action label.

**SFX:** routing line whoosh, subtle confirmation click.

## BEAT 5 - PRODUCT LOCKUP (18.20-20.50s)

**VO cue:** "Run the floor from one screen."

**Concept:** Everything resolves into a clean product lockup over the real dashboard. The app is not a promise; it's already on screen.

**Visual description:** The dashboard screenshot recenters and settles flat. The brand mark scales up beside "Foam Factory CRM." Below it, the line "Run the floor from one screen." appears with a steady blue underline. The background grid dims, leaving the product and promise.

**Mood direction:** confident, clear, finished.

**Assets:** dashboard screenshot, favicon brand mark.

**Animation choreography:** screenshot SETTLES from 3D tilt to flat; brand mark BUILDS from four small squares; product name FADES/Rises; underline DRAWS; final frame HOLDS for readability, then gently dips toward black in the last 0.25s.

**Techniques:** CSS 3D transform, logo build, SVG underline drawing.

**Transition:** final color dip to `#0a0e14`.

**Depth layers:** BG dashboard and glow; MG product lockup; FG underline.

**SFX:** final low chime, pulse resolves.

## Production Architecture

```text
foam-factory-crm-promo/
├── index.html
├── DESIGN.md
├── SCRIPT.md
├── STORYBOARD.md
├── narration.txt
├── narration.wav
├── transcript.json
├── capture/
│   ├── screenshots/
│   ├── assets/
│   └── extracted/
└── compositions/
    └── promo.html
```
