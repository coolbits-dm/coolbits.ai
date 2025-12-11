# Auth Scaffold (M2)

This directory will hold the Magic Link login handlers:
- `/auth/request` – accept an email, issue a one-time code, queue email delivery.
- `/auth/verify` – validate the code, mint session cookies, redirect to portal.

Implementation will tie into the Level Engine so Level-1 → Level-2 transitions can escalate automatically.
Current files are placeholders and should be expanded during M2.
