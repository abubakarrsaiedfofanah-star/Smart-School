# SmartSchool

React + Vite school-management platform, ready for Supabase and Vercel.

1. Copy `.env.example` to `.env` and add your Supabase URL and anon key.
2. Run `npm install`, then `npm run dev`.
3. Apply `supabase/schema.sql`, then every numbered SQL migration in order (`002` through `029`) in the Supabase SQL Editor.
4. Deploy the school registration and school-admin invitation functions with `supabase functions deploy register-school` and `supabase functions deploy manage-school-user`. They use the service-role secret only inside Edge Functions; never add that secret to frontend environment variables.
5. Enable email confirmation and configure the Auth email templates and redirect URL for your local and production app URLs.
6. Add the frontend environment variables in Vercel and deploy.

School registration creates a pending school and its initial administrator. The school administrator can only access setup and subscription details until the platform Super Admin approves the school; student, teacher, and parent portals remain unavailable until approval. After approval, each school administrator manages accounts and branding for that school's portals. Each role signs into its own portal. Subscription plan records are managed manually; payment checkout is not integrated yet.

Migration `027_role_security_hardening.sql` scopes school records by role and relationship, limits SuperAdmin analytics to aggregate counts, and moves quiz grading into the database. Migration `028_school_report_periods.sql` adds academic year and term data to exams for report cards. Migration `029_school_registration_rate_limit.sql` adds a service-role-only registration throttle. Apply all migrations to the Supabase project before using the updated school portals. Payment screens provide school payment instructions but do not confirm transactions.

## Mobile app and TypeScript

SmartSchool can be installed as a Progressive Web App. Build and preview it with `npm run build` and `npm run preview`; the production preview exposes the install prompt for student, teacher, and parent accounts. Browser storage caches only the app shell and static assets. School records and portal data remain online and are never added to the offline cache. On iOS, use Share → Add to Home Screen.

The existing React app remains the shared client for all role portals. TypeScript is enabled for incremental migration of shared modules; run `npm run typecheck` before building. Authentication, role routing, and school-brand color helpers are the first typed modules. The Capacitor dependencies remain available for a later native wrapper, but native Android/iOS projects and their notification credentials have not been generated or configured.
