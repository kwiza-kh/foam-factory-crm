# Design System

## Overview

Foam Factory CRM presents itself as a compact factory operations cockpit rather than a marketing site. The interface is a dark, dense workspace with a sticky customer sidebar, metric cards, warning banners, tabbed workflows, and AG Grid tables. The product experience centers on fast scanning: order status, production scheduling, delivery notes, customer statistics, and accounting workflows all live in one command center. Blue is used for primary actions and active tabs; red, amber, and green carry operational urgency.

## Colors

- **Canvas**: `#0a0e14` - full app background and deep grid surface.
- **Panel**: `#111620` - main cards, sidebar, table sections.
- **Panel Strong**: `#161c28` - reinforced workspace panels.
- **Panel Elevated**: `#1b2231` - buttons, controls, active UI containers.
- **Line**: `#1e2636` - standard hairline borders.
- **Line Strong**: `#2d3748` - selected and elevated borders.
- **Text**: `#e6edf3` - primary text on dark surfaces.
- **Text Secondary**: `#b0b8c4` - labels and supporting text.
- **Muted**: `#6e7681` - placeholders and quiet metadata.
- **Primary Action**: `#5b8def` - active tabs, CTA buttons, selected customer state.
- **Action Hover**: `#7ba5f7` - brighter blue highlight.
- **Action Press**: `#4a7ad6` - darker pressed blue.
- **Alert Red**: `#f85149` - overdue and urgent warnings.
- **Warning Amber**: `#d29922` - approaching deadlines and unpaid emphasis.
- **Success Green**: `#3fb950` - completion and approved status.

## Typography

- **Primary Sans Stack**: Inter, SF Pro Display, PingFang SC, Microsoft YaHei, system-ui, sans-serif.
- **Role**: compact operational UI, table cells, dashboard labels, action buttons, and Chinese product copy.
- **Hierarchy**: 11-13px all-caps labels, 17-22px interface titles, 20px metric values, 60px+ motion-video headline overlays.
- **Data Treatment**: tabular numbers are essential for currency, row counts, quantities, and dates.

## Elevation

Depth comes from layered dark panels, 1px blue-gray borders, and subtle selected-state glows rather than decorative drop shadows. The product UI uses tight radii, inset table boundaries, selected customer outlines, and blue active-tab fills. Video scenes should exaggerate this depth with tilted screenshots, scanline grids, and faint cyan glows while preserving the sober operations-dashboard feel.

## Components

- **Customer Command Sidebar**: sticky left navigation with brand mark, customer search, grouped customer list, backup controls, and selected customer outline.
- **Metric Strip**: four compact cards for customer total, open orders, order amount, and delivery notes.
- **Customer Statistics Table**: summary ledger with totals, unpaid amount, and open/completed order counts.
- **Urgency Banner**: red alert strip warning that the customer has overdue orders.
- **Tabbed Workflow Rail**: product entry, order follow-up, production schedule, delivery draft, delivery note, material archive, statement, payment, and cost entry tabs.
- **AG Grid Workbench**: dense spreadsheet-style order and delivery tables with filters, row numbers, sortable headers, and tabular numeric columns.
- **Action Toolbar**: import, export Excel, customize headers, add order, add statement, and view controls.

## Do's and Don'ts

### Do's

- Use the exact dark surface colors and blue active-state accents from the captured UI.
- Keep layouts dense, aligned, and table-driven; the product is an operations tool.
- Let real screenshots carry the story through perspective, zooms, masks, and parallax.
- Use red and amber sparingly for urgency, not decoration.
- Keep numbers large and readable: 4,621 open orders, ¥54,141.79 order amount, 23 delivery notes.

### Don'ts

- Do not make this feel like a soft SaaS landing page or oversized hero page.
- Do not replace the captured UI with generic card mockups.
- Do not use purple gradients, beige palettes, or playful illustration styles.
- Do not round cards beyond the app's 6-8px radius language.
- Do not let text-only beats run back to back; the CRM screenshots are the product proof.
