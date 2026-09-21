# SmartSchool

React + Vite school-management platform, ready for Supabase and Vercel.

1. Copy `.env.example` to `.env` and add your Supabase URL and anon key.
2. Run `npm install`, then `npm run dev`.
3. Run `supabase/schema.sql`, then `supabase/002_extended_modules.sql`, `supabase/003_platform_controls.sql`, and `supabase/004_academic_management.sql` in the Supabase SQL Editor.
4. Add the same environment variables in Vercel and deploy.

Without Supabase credentials the interface runs in demo mode. In Supabase Auth, enable email confirmation to use the registration email/OTP verification workflow. Never expose a Supabase service-role key in the frontend.
