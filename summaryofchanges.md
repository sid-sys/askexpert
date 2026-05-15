# Summary of Changes

## Subscriber & Membership Flow (New)
- **Free Subscriber Questions**: Implemented logic to allow fans with active monthly subscriptions to ask questions for free. This bypasses Stripe and creates a "SUB_FREE" document in Firestore.
- **Mandatory Login for Subscriptions**: Enforced a strict rule that fans must have an account to subscribe. This ensures we can track their "Active Member" status and provide them with their perks.
- **Server-Side Validation**: Added a check in `app/api/stripe/checkout/route.ts` to block subscription attempts without a valid `followerUid`.
- **Client-Side UX**: Added a "Login required" hint on the monthly pricing card and a pre-checkout login prompt.
- **Smart Form Pre-filling**: Logged-in users now see their name and email automatically filled in the question form, reducing friction.
- **ReferenceError Fix**: Resolved a `ReferenceError: display is not defined` in `app/[username]/page.tsx` by consolidating the `display` variable declaration and moving it before its first use in the `useEffect` hooks.
- **Premium 404 UI**: Implemented a custom 404 page for non-existent users on the profile route, featuring high-contrast typography and a clean "Back Home" CTA, replacing the previous blank screen behavior.

## Infrastructure & Rollback
- **Full Project Reversion**: Performed a complete rollback of the local codebase to the last stable commit (`8f6e632`). This action utilized `git reset --hard` for tracked files and `git clean -fd` for untracked directories, successfully purging experimental features (Asker UI, Chat system) and restoring the platform to its previously hardened production state.
- **Environment Restoration**: Ran `npm install` to synchronize dependencies and successfully started the local development server on `http://localhost:3000`. Confirmed the home page loads correctly.

## Architecture & Navigation
- **Settings Consolidation**: Unified "Edit Page," "Pricing," and "Payout" into a single, popover-style "Settings" menu within the bottom navigation bar on mobile (â‰¤900px). This was done to prevent clutter on small screens where too many bottom nav items were getting cut off (specifically on < 500px).
- **Menu Cleanup**: Removed individual navigation links for the sub-settings to prevent clutter. The active indicator logic was updated so that selecting any sub-setting (Edit/Pricing/Payout) highlights the "Settings" button rather than the profile avatar.
- **Feedback Integration**: Moved the global "Feedback" trigger into the authenticated User Profile popover menu on the bottom nav, effectively reducing surface-level UI clutter on mobile.
- **Top Right Navigation for Mobile**: Kept "View Profile" and "Copy Link" buttons in the dashboard's top right header (`NavBar.tsx`) for authenticated users, avoiding burying them inside the `BottomNav` profile menu. This ensures users have immediate access to sharing tools on mobile devices.
- **Mobile-First Hardening**: Standardized all mobile nav behaviors to use JS-based viewport detection to avoid CSS media-query conflicts within iframes. Fixed NavBar icon-only responsiveness to ensure navigation remains clean on small screens (<500px).
- **Active State Optimization**: Updated `Sidebar.tsx` and `BottomNav.tsx` to suppress item highlights when the user profile popover is open, ensuring a clean and focused UI.
- **Profile State Synchronization**: Fixed a bug in `app/profile/page.tsx` where navigating back to the main profile page from a sub-tab (like Pricing) didn't correctly reset the view. The tab now defaults to 'profile' if no URL parameter is present.
- **GSAP Stabilization**: Fixed `.stat-card` targeting warnings in `app/page.tsx` by expanding the animation context scope.
- **Mandatory Debugging**: Added `/debug/mobile` route for real-time layout auditing at 375px width.

## Infrastructure & Maintenance
- **Storage Retention Policy**: Implemented a new `/api/cron/cleanup-storage` endpoint to automatically purge `asker_attachments/` and `answers/` from Firebase Storage after 7 days.
- **UX Notices**: Added persistent UI warning banners in `RichComposer.tsx` and `QuestionCard.tsx` informing users of the 7-day file retention policy.

## Key Design Decisions
- **Settings Over Profile**: Rebranded the "Edit Page" tab on mobile under 500px to "Settings" which behaves as a dropdown containing the edit page, pricing, and payout screens.
- **Auth Logic**: Authentication actions (Logout/Delete) and Account management (Stripe Billing/Settings) are now strictly contained within the Profile and Settings popover menus on mobile, respectively.
- **Hydration Fixes**: Shifted away from conditional CSS media queries for layout rendering to avoid React hydration mismatches, favoring `useEffect`-based state management for navigation visibility.
- **Navigation Clarity**: Renamed "Edit Page" to "Edit Profile" on Sidebar and BottomNav for semantic clarity.
- **Feedback Mobile Optimization**: Removed the standalone Feedback Floating Action Button (FAB) on mobile screens, instead integrating its toggle logic as a custom event listener that opens via the User Profile popover in the BottomNav.

## Project Activity (2026-05-05)
- **Environment Start**: Initialized local development server on `http://localhost:3000`.
- **Browser Verification**: Confirmed authentication and landing page rendering.
- **Documentation Sync**: Updated `summaryofchanges.md` and `suggested_features.md` to reflect current session activity.
- **Port Conflict Fix**: Identified and terminated zombie process (PID 17604) on port 3000 to resolve `localhost:3001` refusal. Project now correctly serves on default port 3000.


## Static Generation & Suspense Boundaries
- **Prerendering Fixes**: Wrapped the client components in `app/fan-dashboard/page.tsx` and `app/upgrade/page.tsx` with React `<Suspense>` boundaries. Next.js statically analyzes routes during `next build`, and using `useSearchParams` in an un-Suspended client component causes the build to fail if the route isn't explicitly marked as dynamic. By wrapping the content in `<Suspense>`, we ensure the build succeeds and the components stream in on the client side properly.


## Netlify Deployment & Bundling (2026-05-13)
- **Deployment via CLI**: Successfully deployed the project directly to Netlify without connecting to GitHub using the Netlify CLI.
- **Windows Path Bug**: Fixed Netlify deployment server handler crash caused by Windows backslashes (`\`) in paths by creating a `fix_netlify_paths.js` script to sanitize paths and re-deploying without rebuilding.
- **Sentry Internal Server Error**: Resolved an Sentry Instrumentation error where `require-in-the-middle` was missing during production deployment. Fixed by updating `next.config.ts` to include `require-in-the-middle` and `@sentry/nextjs` in `serverExternalPackages`.
