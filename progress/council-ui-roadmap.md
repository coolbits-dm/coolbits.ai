# Council UI Roadmap

## Pass 1 – HTML scaffolding only
- Add the council "+" button on the left side of the composer.
- Add the council active pill above the composer.
- Add the council popover/modal markup near other modals.
- No CSS or JS changes in this pass except wiring ids/classes.

## Pass 2 – CSS styling only
- Style the composer button, pill, popover, and message-level council badges.
- Ensure the existing layout (sidebar, projects, delete, mobile) stays intact.
- No JS behaviour changes in this pass.

## Pass 3 – JS wiring & metadata (UI-only)
- Define per-workspace council members (business/agency/developer).
- Hook the button to open/close the popover.
- Allow selecting an active council member for the current prompt.
- Attach council metadata to local message objects and show badges in the transcript.
- No API shape changes, no backend changes.