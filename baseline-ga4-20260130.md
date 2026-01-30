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

## Smoke outputs (2026-01-30)
== status ==
{
  "connected": true,
  "propertyId": "349726829",
  "selectedPropertyId": "349726829",
  "selectedPropertyName": "Matca Naturals - GA4",
  "lastSyncAt": "2026-01-30T12:40:51.460Z",
  "status": "connected",
  "error": null
}

== properties (first 10) ==
[
  {
    "propertyId": "349726829",
    "displayName": "Matca Naturals - GA4",
    "accountName": "MATCA",
    "resourceName": "properties/349726829"
  },
  {
    "propertyId": "351692402",
    "displayName": "coolbits.ro – GA4",
    "accountName": "Cool Bits",
    "resourceName": "properties/351692402"
  },
  {
    "propertyId": "351693920",
    "displayName": "coolbits.ro – GA4",
    "accountName": "Cool Bits",
    "resourceName": "properties/351693920"
  },
  {
    "propertyId": "354589335",
    "displayName": "har-agency.ro/ – GA4",
    "accountName": "HAR Agency",
    "resourceName": "properties/354589335"
  },
  {
    "propertyId": "377340075",
    "displayName": "Cabinet Psihologic Gînju",
    "accountName": "Cabinet Psihologic Gînju",
    "resourceName": "properties/377340075"
  },
  {
    "propertyId": "381376608",
    "displayName": "www.homelocktechnology.com - GA4",
    "accountName": "Cont Google Ads",
    "resourceName": "properties/381376608"
  },
  {
    "propertyId": "455773846",
    "displayName": "Ambio Events",
    "accountName": "Ambio Events",
    "resourceName": "properties/455773846"
  },
  {
    "propertyId": "474653985",
    "displayName": "depo-box.ro",
    "accountName": "Boxe Depozitare Iaşi, Spaţii Depozitare de Închiriat",
    "resourceName": "properties/474653985"
  },
  {
    "propertyId": "520372228",
    "displayName": "Avicena Computers",
    "accountName": "Avicena Computers",
    "resourceName": "properties/520372228"
  }
]

== select-property (Matca as test) ==
{
  "connected": true,
  "propertyId": "349726829",
  "selectedPropertyId": "349726829",
  "selectedPropertyName": "Matca Naturals - GA4",
  "lastSyncAt": "2026-01-30T12:44:56.719Z",
  "status": "connected",
  "error": null
}

== status after select ==
{
  "connected": true,
  "propertyId": "349726829",
  "selectedPropertyId": "349726829",
  "selectedPropertyName": "Matca Naturals - GA4",
  "lastSyncAt": "2026-01-30T12:44:56.719Z",
  "status": "connected",
  "error": null
}

== fields traffic_acquisition ==
defaults: sessions,totalUsers,engagedSessions,conversions,totalRevenue,engagementRate
== report traffic_acquisition ==
{
  "meta": {
    "preset": "traffic_acquisition",
    "selectedFields": [
      "sessions",
      "totalUsers",
      "engagedSessions",
      "conversions",
      "totalRevenue",
      "engagementRate"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "sessionDefaultChannelGroup": "Paid Social",
    "sessionSource": "facebook",
    "sessionMedium": "paid",
    "sessions": 1469,
    "totalUsers": 1190,
    "engagedSessions": 644,
    "conversions": 6,
    "totalRevenue": 1569.400001,
    "engagementRate": 0.4383934649421375
  }
}

== fields pages_screens ==
defaults: screenPageViews,totalUsers,sessions,engagedSessions,conversions,totalRevenue,engagementRate
== report pages_screens ==
{
  "meta": {
    "preset": "pages_screens",
    "selectedFields": [
      "screenPageViews",
      "totalUsers",
      "sessions",
      "engagedSessions",
      "conversions",
      "totalRevenue",
      "engagementRate"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "pagePath": "/",
    "pageTitle": "MATCA NATURAL FINE FRAGRANCE",
    "screenPageViews": 1767,
    "totalUsers": 1232,
    "sessions": 1427,
    "engagedSessions": 1151,
    "conversions": 0,
    "totalRevenue": 0,
    "engagementRate": 0.8065872459705676
  }
}

== fields events ==
defaults: eventCount,totalUsers,sessions,engagedSessions,conversions,totalRevenue
== report events ==
{
  "meta": {
    "preset": "events",
    "selectedFields": [
      "eventCount",
      "totalUsers",
      "sessions",
      "engagedSessions",
      "conversions",
      "totalRevenue"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "eventName": "page_view",
    "eventCount": 16182,
    "totalUsers": 4246,
    "sessions": 5184,
    "engagedSessions": 3013,
    "conversions": 0,
    "totalRevenue": 0
  }
}

== fields conversions ==
defaults: conversions,totalUsers,sessions,engagedSessions,totalRevenue
== report conversions ==
{
  "meta": {
    "preset": "conversions",
    "selectedFields": [
      "conversions",
      "totalUsers",
      "sessions",
      "engagedSessions",
      "totalRevenue"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "eventName": "purchase",
    "conversions": 60,
    "totalUsers": 59,
    "sessions": 60,
    "engagedSessions": 59,
    "totalRevenue": 15587.981266999997
  }
}

== fields landing_pages ==
defaults: sessions,engagedSessions,engagementRate,totalUsers,conversions,totalRevenue
== report landing_pages ==
{
  "meta": {
    "preset": "landing_pages",
    "selectedFields": [
      "sessions",
      "engagedSessions",
      "engagementRate",
      "totalUsers",
      "conversions",
      "totalRevenue"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "landingPagePlusQueryString": "/",
    "pagePath": "/",
    "pageTitle": "shopifybooster.pro",
    "sessionSource": "shopifybooster.pro",
    "sessionMedium": "referral",
    "sessions": 345,
    "engagedSessions": 344,
    "engagementRate": 0.9971014492753624,
    "totalUsers": 345,
    "conversions": 0,
    "totalRevenue": 0
  }
}

== fields user_acquisition ==
defaults: newUsers,totalUsers,sessions,engagedSessions,engagementRate,conversions,totalRevenue
== report user_acquisition ==
{
  "meta": {
    "preset": "user_acquisition",
    "selectedFields": [
      "newUsers",
      "totalUsers",
      "sessions",
      "engagedSessions",
      "engagementRate",
      "conversions",
      "totalRevenue"
    ],
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-01-30"
    }
  },
  "overview": null,
  "firstRow": {
    "firstUserDefaultChannelGroup": "Paid Social",
    "firstUserSource": "facebook",
    "firstUserMedium": "paid",
    "newUsers": 1052,
    "totalUsers": 1173,
    "sessions": 1448,
    "engagedSessions": 636,
    "engagementRate": 0.43922651933701656,
    "conversions": 6,
    "totalRevenue": 1569.400001
  }
}

