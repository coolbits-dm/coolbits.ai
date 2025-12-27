Here’s the full prompt for Codex to implement the foundation for CMI – Core Maturity Index:

�� Codex Task — Maturity Index Page & System Scaffolding

We’re introducing CMI (Core Maturity Index) as the central maturity evaluation system across personal, business, and development workflows.

🔷 1. Create a Dedicated Page: /maturity

Static route: /maturity

Title: Maturity Index

This is a standalone, scrollable view (❌ no modals or popups)

Style: same visual depth as /agents/ or /connectors/

🔶 2. Structure the Page into 3 Main Metric Groups

Each group has mock visualizations and data blocks:

a. PMI — Personal Maturity Index

Data inputs:

Routine payloads completed (e.g., Focus agent)

Use of snapshots

Camarad interaction rate

Diversity of tasks

Visuals:

Radial / bar meter

Weekly score timeline

Suggested focus areas (mock only)

b. BMI — Business Maturity Index

Data inputs:

Council usage rate (business workspace)

Google Ads & GA4 snapshot frequency

Reporting completeness

Agent diversity in use

Visuals:

KPI tile layout

Token cost vs. insights value bar

Suggested council alignment score

c. DMI — Development Maturity Index

Data inputs:

Build council usage

DevOps + CTO agent triggers

Prompt quality (depth, structure)

Testing frequency (mocked)

Visuals:

Timeline + token efficiency mock

Agent execution charts

💠 3. Display the Aggregated CMI (Core Maturity Index)

Top of page block: CMI: 74 / 100 (mock value)

Include a color-coded badge:

Red <50, Yellow 50-70, Green 70+

Include a fake “Last Calculated” timestamp

Add formula preview:

CMI = 0.4 * PMI + 0.35 * BMI + 0.25 * DMI

📊 4. Visual Style

No live data yet — all values are placeholders

Use cards or tiles per index section

Simple data bars, dials, or radial meters (mock graphics)

Add a “Coming Soon” ribbon on any incomplete metrics

🧠 5. Registry for Later Data Binding

Add placeholder maturityIndexRegistry.js or mock data map

Include sample structure:

{
  cmi: 74.3,
  pmi: 80.1,
  bmi: 72.4,
  dmi: 66.7,
  lastUpdated: "2025-12-25T15:34:00Z"
}

✅ Summary

Add /maturity page titled "Maturity Index"

Show mock data and visualizations for PMI, BMI, DMI

Display computed CMI at top

Use placeholders and styling consistent with agents/councils

No modals, no interactivity yet

Focus is on full structure and layout — data and logic binding will come later.
