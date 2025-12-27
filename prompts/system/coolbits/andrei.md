Noted. If “Office CoolBits” is now replying from office@coolbits.ai, the next thing to standardize is a single canonical footer/signature (plain text + HTML) and to enforce it server-side (so agents can’t “forget”).

1) Minimal, compliant footer (plain text)

Copy/paste:

—
COOL BITS S.R.L.
CUI: 42331573 | EUID: ROONRC.J22/676/2020
Nr. Reg. Com.: J22/676/2020 (27.02.2020)
Sediu: Jud. Iași, mun. Iași, str. Columnei, nr. 14, bl. K4, et. 4, ap. 19, România
Website: https://coolbits.ai | Email: office@coolbits.ai


Optional (only if you want to expose it in email footer):

IBAN: RO76INGB0000999910114315 | ING Office Iași Anastasie Panu

2) “Full” footer (plain text + confidentiality + GDPR)
—
COOL BITS S.R.L.
CUI: 42331573 | EUID: ROONRC.J22/676/2020
Nr. Reg. Com.: J22/676/2020 (27.02.2020)
Sediu: Jud. Iași, mun. Iași, str. Columnei, nr. 14, bl. K4, et. 4, ap. 19, România
https://coolbits.ai | office@coolbits.ai

Confidențialitate: Acest e-mail (și orice atașamente) poate conține informații confidențiale și este destinat exclusiv destinatarului. Dacă l-ați primit din greșeală, vă rugăm să ne anunțați și să îl ștergeți.
GDPR: Pentru solicitări privind datele personale (acces/rectificare/ștergere), contactați office@coolbits.ai.

3) HTML signature (Gmail-safe)
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#6b7280;margin-top:14px">
  <div style="margin:10px 0;border-top:1px solid #e5e7eb"></div>
  <div style="color:#111827;font-weight:700">COOL BITS S.R.L.</div>
  <div>CUI: 42331573 <span style="color:#9ca3af">|</span> EUID: ROONRC.J22/676/2020</div>
  <div>Nr. Reg. Com.: J22/676/2020 (27.02.2020)</div>
  <div>Sediu: Jud. Iași, mun. Iași, str. Columnei, nr. 14, bl. K4, et. 4, ap. 19, România</div>
  <div>
    <a href="https://coolbits.ai" style="color:#2563eb;text-decoration:none">coolbits.ai</a>
    <span style="color:#9ca3af">•</span>
    <a href="mailto:office@coolbits.ai" style="color:#2563eb;text-decoration:none">office@coolbits.ai</a>
  </div>
  <div style="margin-top:8px;font-size:11px;color:#9ca3af">
    Confidențialitate: acest e-mail poate conține informații confidențiale. Dacă l-ați primit din greșeală, vă rugăm să ne anunțați și să îl ștergeți.
  </div>
</div>

4) Enforcement (so it’s always there)

Implement it backend-side as a mandatory post-processor:

finalBody = agentDraft + "\n\n" + SIGNATURE_TEXT (or HTML version depending on Content-Type)

If user explicitly sets a custom signature later, store it per mailbox and still append the company legal block.

5) Token/accounting integration (ties into your “who consumed tokens” matrix)

Every outbound email should produce a traceable usage record:

traceId per send

ledger entry category: tool.email.send

fields: from, toCount, subjectHash, bodyChars, modelUsed, tokens, costUsd, costCbT, walletBefore/After

If you paste the exact email-sending endpoint/payload (your internal API), I can give you the exact response contract + logging line so the UI can show “Email sent (cost: X cbT)” deterministically.

Thought for 20s

Screenshot confirms the Google Account identity for office@coolbits.ai is live and branded (“Office CoolBits”). Next steps if you want this to behave like a proper official/NHA operator account (usable + compliant):

1) Branding that actually shows up to recipients

Google Account → Personal info

Profile photo: click the camera icon on the avatar → upload the “green” frontal photo (square crop).

Name: set exactly how you want it to appear in Gmail recipients:

Recommended: Office CoolBits

If you want the NHA concept visible: Office CoolBits (NHA) (note: this will show up in inboxes)

Gmail → Settings → See all settings → General

Signature: paste the company legal block (text + HTML if you use rich signature).

Enable signature for new emails + replies/forwards.

2) Security hardening (minimum baseline)

Google Account → Security

Turn on 2-Step Verification (prefer passkey or authenticator).

Generate and store backup codes.

Review Recent security activity and Your devices.

Third-party access: remove anything not strictly required.

If you use API automation: avoid “less secure app” style access; use OAuth.

3) Make it usable as a connector identity (Gmail API / Google connectors)

Decision point for architecture (you likely want both):

A) Human mailbox use (Gmail UI)

Keep as is: users reply from office@coolbits.ai, signature enforced.

B) Automation use (CoolBits connectors)

Use OAuth with offline access and store:

refresh_token (encrypted at rest)

connection metadata (scopes, createdAt, owner)

Never store provider secrets in frontend.

For compliance: encrypt tokens with KMS or app-level encryption; master key reference in GCP Secret Manager.

Minimal stored fields (DB):

google_refresh_token_enc

google_scopes

google_account_email

created_at, rotated_at

status

4) Tie-in to your “who consumed tokens” matrix (emails are not “free”)

Every outbound email action in your system should write:

traceId

actor: office@coolbits.ai (or “NHA”)

tool: gmail.send

cost: tokens/cbT (if you bill for it) + “0” model cost if it’s template-only

wallet before/after

This makes “tokeni in/out status” consistent with everything else.

If you want, paste your current email send flow (endpoint + payload format) and I’ll give you the exact required response meta contract (requested/resolved, traceId, ledgerEntryId) so UI can show “Sent (cost: X cbT)” deterministically.
