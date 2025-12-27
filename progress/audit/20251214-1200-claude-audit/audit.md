# Forensic Audit Report: CoolBits.ai
**Date:** 2025-12-14 16:42 UTC
**Auditor:** Claude (GitHub Copilot)
**Scope:** Live VPS deploy, read-only analysis.

## 1. Executive Summary

Three critical issues were investigated:
1.  **Google Ads OAuth Failure:** Caused by a protocol mismatch (`http` vs `https`) in the `redirect_uri` construction due to Nginx overwriting the `X-Forwarded-Proto` header from Cloudflare.
2.  **Backend EACCES Errors:** The Node.js process (user `cblm`) cannot write to `requests.log`. While file permissions appear correct (`rw-rw-r-- cblm:cblm`), the persistence of the error suggests a potential file descriptor lock or AppArmor restriction, though AppArmor profiles loaded do not explicitly target `coolbits`.
3.  **Static Assets (404):** Unable to reproduce. `/assets/style.css` returns HTTP 200 OK with correct content type. User report likely stems from browser caching or a specific map file request.

## 2. System Layer Analysis

### Frontend Rendering
*   **Status:** Operational.
*   **Assets:** `/assets/style.css` and `/assets/chat.js` are served correctly with `HTTP/2 200`.
*   **Evidence:** `assets_heads.txt` confirms file existence and curl success.

### CDN Caching (Cloudflare)
*   **Status:** Active.
*   **Headers:** `cf-visitor: {"scheme":"https"}` is present in requests.
*   **Issue:** Cloudflare connects to Nginx via HTTP (Flexible/Full non-strict), causing Nginx to see `$scheme` as `http`.

### Reverse Proxy (Nginx)
*   **Status:** Misconfigured for Proxy Headers.
*   **Config:** `proxy_set_header X-Forwarded-Proto $scheme;` (Lines 449-450 in `nginx_proxy_snippet.txt`).
*   **Impact:** Overwrites the valid `X-Forwarded-Proto: https` from Cloudflare with `http`. This misleads the backend into generating `http://` redirect URIs.

### Backend Runtime (Node.js / PM2)
*   **Status:** Online (Process ID 2).
*   **User:** `cblm` (UID 1000).
*   **Errors:** High volume of `EACCES` for `requests.log`.
*   **Env:** `GOOGLE_ADS_OAUTH_REDIRECT_BASE` is set to `https://coolbits.ai`, but the code prefers dynamic detection which fails due to the Nginx header issue.

### OAuth Logic
*   **Flow:**
    1.  `/auth/url`: Generates URL with `redirect_uri` based on `getPublicBase(req)`. Due to Nginx config, this is `http://coolbits.ai/...`.
    2.  User approves at Google (if Google allows `http` or if the user manually fixed it).
    3.  Callback to `/oauth/callback`.
    4.  `getToken` sends `redirect_uri` again.
*   **Failure:** If the Google App is registered with `https://...`, an `http://...` redirect URI will cause `redirect_uri_mismatch`. If the app allows `http` (localhost testing) but the callback comes back on `https`, the mismatch might still occur if the backend thinks it's `http`.

## 3. Ranked Root Causes

### Critical Severity
1.  **Nginx Header Misconfiguration (OAuth Failure)**
    *   **Root Cause:** `proxy_set_header X-Forwarded-Proto $scheme;` forces `http` when behind Cloudflare SSL termination.
    *   **Evidence:** `nginx_proxy_snippet.txt` line 450. `googleads-router.js` logic relies on this header.
    *   **Fix:** Change to `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;` or use `map` to handle Cloudflare.

2.  **Log File Permission/Locking (EACCES)**
    *   **Root Cause:** `fs.appendFileSync` fails despite correct `ls -la` permissions. Likely a stale file descriptor or race condition if multiple processes (e.g., PM2 and App) try to write, or if the file was rotated externally without restarting the app.
    *   **Evidence:** `pm2_recent_err.txt` shows repeated `EACCES`. `ls -la` shows `cblm` ownership.
    *   **Fix:** Restart the application (`pm2 restart coolbits`) to refresh file handles. If persistent, check `dmesg` for AppArmor denials (though `aa-status` showed no specific profile for `coolbits`).

### Low Severity
3.  **Static Asset 404 (False Positive?)**
    *   **Root Cause:** Likely client-side caching or incorrect URL (e.g., missing version param in user's test).
    *   **Evidence:** `curl` from localhost returns 200. File exists.

## 4. Recommended Next Actions

1.  **Verify Nginx Config:**
    *   Edit `/etc/nginx/sites-enabled/coolbits.ai.conf`.
    *   Replace `proxy_set_header X-Forwarded-Proto $scheme;` with `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;` (or `$scheme` fallback).
    *   `sudo nginx -t && sudo systemctl reload nginx`.

2.  **Restart Backend:**
    *   `pm2 restart coolbits`.
    *   Verify `EACCES` errors stop in `pm2 logs`.

3.  **Retry OAuth:**
    *   Trigger Google Ads connection again.
    *   Monitor logs for `[GOOGLEADS_AUTH_URL_CONFIG]` to confirm `base` is now `https://...`.

## 5. Artifacts
*   `/opt/coolbits.ai/progress/audit/20251214-1200-claude-audit/`
    *   `audit.md` (This file)
    *   `pm2_env_sanitized.txt`
    *   `logs_perms.txt`
    *   `googleads_router.txt`
    *   `nginx_proxy_snippet.txt`
    *   `assets_heads.txt`
