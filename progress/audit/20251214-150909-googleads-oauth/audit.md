# Forensic Audit Report: CoolBits Google Ads OAuth + EACCES
**Date:** 2025-12-14T17:09:11+02:00
**Case:** Google Ads OAuth failures (redirect_uri mismatch, token exchange) & Logging EACCES

## 1. Backend Runtime & Process Identity
*Evidence: `process_identity.txt`, `pm2_info.txt`*
- **Hypothesis:** The Node.js process is running as a user (e.g., `cblm`) that lacks write permissions to the log directory.
- **Verify:** Compare `uid/gid` in `process_identity.txt` with file owners in `log_perms.txt`.

## 2. Logging Permissions (EACCES)
*Evidence: `log_perms.txt`, `pm2_logs_filtered.txt`*
- **Hypothesis:** `/opt/coolbits.ai/logs/requests.log` is owned by root or has strict permissions (e.g., 644) preventing the app user from writing.
- **Verify:** Look for `Permission denied` in logs correlating with file stats.

## 3. OAuth Flow & Redirect URI Mismatch
*Evidence: `pm2_logs_filtered.txt`, `nginx_config.txt`*
- **Hypothesis:** The app generates a redirect URI based on internal headers (e.g., `http://localhost`) or the wrong host (`cloud.cblm.ai`) instead of the public `https://coolbits.ai`.
- **Verify:** 
    - Check logs for `redirect_uri` values sent to Google.
    - Check Nginx config for `proxy_set_header Host $host;` vs `$proxy_host`.
    - Check for `X-Forwarded-Proto` headers.

## 4. Static Assets (404s)
*Evidence: `assets_check.txt`*
- **Hypothesis:** Nginx is not correctly mapping `/assets` to `/opt/coolbits.ai/public/assets`, or permissions prevent reading.
- **Verify:** Compare `ls -la` output with Nginx `root` or `alias` directives.

## 5. Frontend/API Host Mismatch
- **Hypothesis:** If frontend uses `coolbits.ai` but API thinks it's on `cloud.cblm.ai`, cookies (SameSite) or OAuth redirects will fail.

## Artifacts Index
assets_check.txt
audit.md
log_perms.txt
nginx_config.txt
pm2_info.txt
pm2_logs_filtered.txt
pm2_logs_raw.txt
process_identity.txt
runtime_identity.txt
