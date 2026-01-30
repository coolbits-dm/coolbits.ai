# Google Calendar Baseline — 2026-01-30

## Snapshot
- file: baselines/baseline-gcal-20260130.tgz
- sha256: 66044ea8a4c8ea284b137ac2dffec4a67550e7266b6dbb1c54eaac629d6bba7e

## Frontend asset hashes (sha1)
- public/assets/chat.js: b2bc211d21818c2b0fda66a1718bcf3f5f326b61
- public/assets/style.css: 19c3a427a929911dbb0c7c2754ddd3799f1f1c18
- public/chat.html: 47452e3952ee975b1bf7ae8616774ee35b29ff0d

## chat.html version line
  <script src="/assets/chat.js?v=b2bc211d" type="module" defer></script>

## Smoke outputs
### GET /api/connectors/gcal/status

```json
{"connected":false,"status":"disconnected","calendarId":null,"calendarName":null,"lastSyncAt":null,"error":null}
```

### GET /api/connectors/gcal/calendars

```json
{"error":"not_connected"}
```

### POST /api/connectors/gcal/select-calendar (primary)

```json
{"error":"not_connected"}
```

### GET /api/connectors/gcal/fields?preset=upcoming_events

```json
{"preset":"upcoming_events","defaults":["summary","start","end","location","organizer"],"fields":[{"key":"summary","label":"Summary","type":"dimension","defaultSelected":true},{"key":"start","label":"Start","type":"dimension","defaultSelected":true},{"key":"end","label":"End","type":"dimension","defaultSelected":true},{"key":"location","label":"Location","type":"dimension","defaultSelected":true},{"key":"organizer","label":"Organizer","type":"dimension","defaultSelected":true},{"key":"htmlLink","label":"Link","type":"dimension","defaultSelected":false}]}
```

### GET /api/connectors/gcal/report?preset=upcoming_events&from=2026-01-30&to=2026-03-01&fields=summary,start,end,location,organizer&calendarId=primary

```json
{"error":"not_connected"}
```
