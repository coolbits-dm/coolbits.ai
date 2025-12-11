# Backend OAuth & Google Verification Plan

## Overview
- Goal: Use Google Sign-In (OAuth) to identify CoolBits users with minimal scopes (openid, email, profile).
- Scope: OAuth configuration in Google Cloud, backend auth routes, and the verification / publish process.

## Current State
- OAuth User type: External
- Status: Testing
- Authorized domains: (fill in actual list)
- Scopes used: (list actual scopes from console; expected: openid, email, profile only)

## Milestones
1. Confirm we only use non-sensitive scopes.
2. Legal pages live and linked in the OAuth consent screen.
3. App published to Production.
4. Brand/OAuth verification accepted by Google.

## Tasks

### M1 – Scope & config audit
- [ ] In Google Auth Platform, list all OAuth scopes configured for this app.
- [ ] Confirm they are limited to:
  - `openid`
  - `.../userinfo.email`
  - `.../userinfo.profile`
- [ ] If any sensitive or restricted scopes exist, document them and decide whether to remove them or accept a heavier verification path.
- [ ] Verify that `coolbits.ai` is in Authorized domains and domain ownership is verified.

### M2 – Connect legal pages
- [ ] Ensure these URLs exist and are correct:
  - Application home page: `https://coolbits.ai`
  - Privacy policy: `https://coolbits.ai/legal/privacy`
  - Terms of service: `https://coolbits.ai/legal/terms`
- [ ] Update the OAuth consent screen to reference exactly these URLs.
- [ ] Confirm the branding (name + logo) matches the public site.

### M3 – Publish app & prepare verification
- [ ] Switch app from Testing to Production in Google Auth Platform.
- [ ] Fill in the “Prepare for verification” form:
  - Describe what the app does (CoolBits.ai assistant).
  - Describe how Google user data is used:
    - Only for authentication and mapping a workspace/billing account.
    - No access to Gmail, Drive, Calendar, Ads, etc.
  - Provide links to home page, privacy, terms.
- [ ] Record any additional information requested by Google in this section.

### M4 – Post-verification checks
- [ ] Once verification is approved, test login with at least:
  - 1 user from a different domain (non coolbits).
  - 1 random Gmail account.
- [ ] Confirm that the consent screen shows correct branding and no “unverified app” warnings.
- [ ] Document the final state of scopes and any limitations.

## Notes
- Use this file to log any issues or back-and-forth with Google during verification.
