# GA4 Baseline — 2026-01-30

## Snapshot
- File: baseline-ga4-20260130.tgz
- sha256: b14347fa97172d1d55cfdc553f623497c8bf7e89d18ff5a1457896e9995bfd60

## Frontend assets (sha1)
- public/assets/chat.js:  578240c9638330313e8df89ceb52538e8fb6712b
- public/assets/style.css: 19c3a427a929911dbb0c7c2754ddd3799f1f1c18
- public/chat.html:        52eafcf2877a8dc610c2051e535e20ca6eb9b570

## chat.html version line
1325:  <script src="/assets/chat.js?v=578240c9" type="module" defer></script>

## GA4 Presets (expected to work end-to-end)
- traffic_acquisition
- pages_screens
- events
- conversions
- landing_pages
- user_acquisition

## GA4 Property selector
- Endpoint: GET /api/connectors/ga4/properties
- Persist:  POST /api/connectors/ga4/select-property (propertyId=...)
- Status:   GET /api/connectors/ga4/status includes selectedPropertyId/Name

## Smoke tests (paste curl outputs)
- /api/connectors/ga4/status
- /api/connectors/ga4/properties
- /api/connectors/ga4/fields?preset=traffic_acquisition
- /api/connectors/ga4/report?from=...&to=...&preset=traffic_acquisition&fields=sessions,totalUsers
