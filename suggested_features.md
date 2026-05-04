# Suggested Features & Upgrades

## Implemented Features
- **Dynamic SLA Framework**: Standardized `responseTimeHours` across the platform.
- **SLA Freezing**: Saving SLA and creator details directly in the question document for reliability and performance.
- **Admin Testing Tools**: Dynamic email preview and testing for creator-specific settings.
- **Dynamic SLA Notifications**: Replaced hardcoded response times with creator-specific values in all system emails (Webhook, Notify, and both Refund Crons).
- **Admin Test Suite**: Enhanced the admin panel to test emails with specific creator context (name/SLA).
- **Email Content Cleanup**: Removed legacy instructions and hardcoded 72-hour text from templates, fully integrating the dynamic calculation model.
- **Shared SLA Utils**: Centralized duration formatting logic for a consistent experience across web and email.
- **Resend Service Hardening**: Refactored the email service layer for production reliability, including robust error handling, audit logging for every notification, and syntax fixes to prevent runtime crashes.
- **Asker Name Capture**: Implemented a required name field in the question submission form to personalize the creator experience.
- **Creator Dashboard Personalization**: Updated `QuestionCard` to display the asker's name instead of email, with email as a fallback.
- **Mobile Audit Tool**: Implemented a dedicated `/debug/mobile` route for mobile-first UI auditing at 375px.
- **Atomic Transaction Hardening**: Implemented Firestore transactions across Answer and Refund workflows to guarantee data consistency and prevent race conditions between creators and automated crons.
- **Side-Effect Orchestration**: Re-ordered system logic to prioritize database commits before executing external actions (Stripe/Resend), ensuring system state reflects reality even during network failures.
- [x] **Universal Button Hardening**: Standardized all platform buttons with consistent padding, font weight (900), and premium hover effects. (Implemented ✅)
- [x] **Modern Sidebar Layout**: Implemented a professional, responsive sidebar for desktop navigation with GSAP animations. (Implemented ✅)
- [x] **Global Light Mode Transition**: Standardized the platform to a premium light mode aesthetic. (Implemented ✅)
- [x] **Mobile Bottom Navigation Bar**: Implemented a fixed bottom nav for mobile users with active state indicators. (Implemented ✅)
- [x] **Vacation Mode Quick Toggle**: Moved vacation settings directly to the dashboard for instant access. (Implemented ✅)
- [x] **File Cleanup API**: Automated storage purging for files older than 7 days. (Implemented ✅)
- [x] **Mobile Settings Consolidation**: Unified Pricing, Payout, and Profile under a single "Settings" menu for small mobile devices. (Implemented ✅)
- [x] **Profile Tab Synchronization**: Fixed state bugs ensuring the profile page correctly resets to the default tab when navigated. (Implemented ✅)
- [x] **Conditional Nav Highlighting**: Suppressed navigation highlights when secondary popover menus are active. (Implemented ✅)

## Suggested Features

1. **Interactive Dashboard Skeleton Loaders**: Use `Animate.css` to create smooth pulse animations for dashboard cards during data fetching to eliminate layout shifting and improve perceived speed.
2. **GSAP Hover Micro-interactions**: Implement premium hover effects for all cards (brutal-card) using GSAP, including subtle 3D transforms or depth shifts on mouse-over.
3. **Lenis Smooth Scrolling**: Integrate the `Lenis` library for cinematic, smooth scrolling across the dashboard and profile pages to enhance the premium feel of the platform.
4. **Storage Cleanup Authentication**: Add a `CRON_SECRET` environment variable and require it in the `Authorization` header of the `/api/cron/cleanup-storage` endpoint.
5. **Soft Deletion for Storage**: Before permanently deleting files, move them to an intermediate bucket or add a 30-day lifecycle expiration rule natively in Firebase Storage.
6. **Smart Escalation**: Create a warning notification for creators when their SLA is 80% consumed to prevent accidental refunds.
7. **SLA Badge on Profile**: Display the creator's "Actual Avg. Response Time" alongside their promised SLA on their profile to build trust through transparency.
8. **Creator Performance Dashboard**: Provide creators with a chart showing their average response time vs. their promised SLA to help them optimize their workflow.
9. **Real-time Question Updates**: Integrate Firebase Listeners (`onSnapshot`) in the Dashboard to show new questions instantly without refreshing.
10. **Custom Creator Slugs**: Allow creators to claim a custom URL slug (e.g., `askexpert.com/myname`) instead of just a numeric ID.
11. **Native Sharing Integration**: For the "Copy Link" mobile action, utilize the Web Share API (`navigator.share`) to offer a native system share dialogue.
12. **Feedback Context Capture**: Automatically attach device info (OS, browser, screen size) to bug reports submitted via the Feedback system.
13. **Profile Completion Progress**: Add a subtle progress bar to the `Edit Profile` page indicating how complete the creator's profile is.
14. **Bottom Nav Badge Counts**: Show unread/pending badge counts on the Dashboard bottom nav item using a red dot.
15. **Mobile Swipe Navigation**: Implement horizontal swipe gestures between the main sections (Dashboard → Analytics → Profile) using GSAP Draggable.
16. **Interactive Image Previews**: Use `SweetAlert2` to display high-resolution image attachments in a beautiful modal when clicked, rather than opening them in a new tab.
17. **Brutalism-Inspired Page Transitions**: Use `Framer Motion` or `GSAP` to create "page slide" or "zoom" transitions when navigating between dashboard tabs, reinforcing the editorial aesthetic.
18. **Smart Session Recovery**: Implement a local-storage-based "Draft" system for the Rich Text Composer so creators don't lose their answers if the browser crashes or they accidentally refresh.
