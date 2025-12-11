export const rateLimitConfig = {
  windowMs: 60_000, // 1 minute
  guestMaxRequestsPerWindow: 10, // per IP
  userMaxRequestsPerWindow: 30, // per user/email
  globalMaxTokensPerHour: 200_000, // safety fuse
  chatMaxPerUserWorkspace: 30,
  agentsMaxPerUserWorkspace: 12,
};
