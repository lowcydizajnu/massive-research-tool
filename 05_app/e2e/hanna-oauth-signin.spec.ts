import { test } from "@playwright/test";

/**
 * Google OAuth sign-in lands on /studies, not back at /signin (V1.7.1 item 5).
 *
 * MARKED test.fixme — a real Google OAuth flow can't be driven from Playwright:
 * @clerk/testing's testing-token sign-in covers password + email-link, not the
 * external Google consent screen. Driving it needs Clerk's OAuth testing setup
 * (a configured test OAuth provider) which isn't wired here. The fix itself
 * (5a dedicated /sso-callback, 5d /signup pending-OAuth pickup, 5c clear error,
 * 5b dashboard account-linking) is verified manually per
 * 04_architecture/handoffs/clerk-oauth-identity-linking.md.
 *
 * The intended assertion, once OAuth testing is wired:
 *   1. sign in via Google as an EXISTING test user (email already has a
 *      magic-link account, account-linking enabled per 5b)
 *   2. expect the URL to settle on /studies — NOT /signin and NOT the /signup
 *      empty email form.
 */
test.describe("Google OAuth sign-in", () => {
  test.fixme("existing Google user lands on /studies, not /signin", async () => {
    // Pending Clerk OAuth testing configuration — see the file header.
  });
});
