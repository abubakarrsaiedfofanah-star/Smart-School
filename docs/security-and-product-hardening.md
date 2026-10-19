# Security and product hardening

## Shipped in this update

- Edge Functions reject requests unless the browser `Origin` exactly matches `SMARTSCHOOL_ALLOWED_ORIGINS`.
- Protected routes check Supabase Authenticator Assurance Level. Accounts with a verified TOTP factor must complete a code challenge before opening portal pages.
- Security settings can enroll, verify, or remove a real Supabase TOTP factor, set a 12-character minimum password, and revoke sessions globally.
- Sign out clears the current user's attendance/grade IndexedDB cache and quiz-answer local storage.
- Profile settings save delivery channel preferences. Migrations 034 and 042 create a private, service-role-only outbox, bounded retries, signed webhook delivery, and per-user push-device registration.
- The portal has Ctrl/Cmd+K quick navigation, and school administrators see a setup checklist based on their school's live records.
- Security settings provide a JSON download of the signed-in user's profile, notifications, linked learner records, attendance, and results allowed by the existing row policies.

## Deployment steps

1. Apply migrations `034_notification_delivery_outbox.sql` through `074_subscription_trial_lifecycle.sql` in numerical order.
2. Set the Supabase Edge Function secret. Example: `supabase secrets set SMARTSCHOOL_ALLOWED_ORIGINS="https://school.example,https://www.school.example"`. Add `http://localhost:5173` only in a development project. Add `capacitor://localhost` only when using that native origin.
3. Set `NOTIFICATION_WORKER_SECRET`, `NOTIFICATION_DELIVERY_WEBHOOK_URL` (HTTPS), and `NOTIFICATION_DELIVERY_WEBHOOK_SECRET` as Edge Function secrets. Deploy with `supabase functions deploy deliver-notifications`. Its `config.toml` disables Supabase JWT verification for that function; the worker verifies its own high-entropy bearer secret.
4. Configure the trusted webhook adapter. It receives a JSON `smartschool.notification` event and an `X-SmartSchool-Timestamp` plus `X-SmartSchool-Signature: v1=<hex>` HMAC-SHA256 signature over `<timestamp>.<raw request body>`. Verify the signature in constant time, reject stale timestamps (for example, older than five minutes), use `delivery_id` as the provider idempotency key, and return 2xx only after the provider accepted the message. Do not log payload bodies, recipient addresses, tokens, or message content. Protect the adapter endpoint with provider-specific quotas and alerting.
5. Invoke the worker from a trusted scheduler every minute with `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>` and a small JSON body such as `{"limit":25}`. Restrict access to the scheduler. Monitor returned claimed/sent/failed/cancelled counts and terminal outbox failures. Push delivery also needs native APNS/FCM credentials and a provider adapter; database token registration alone does not deliver push messages.
6. In Supabase Auth, enable TOTP MFA and configure the assurance policy appropriate to the school. The frontend challenges users with an enrolled factor; privileged database changes also require MFA at the database layer.

Migration 057 enforces the active-profile flag in shared database authorization helpers and privileged RPCs, prevents users from changing their own active status, and limits employee self-service reads to active accounts and matching school records. The sign-in flow and protected routes also reject disabled profiles. Apply the migration before relying on disabled-account revocation.

Migration 058 restricts asset inventory reads to active school administrators, platform administrators, and staff assigned inventory-view permission. Inventory management remains limited to roles with inventory-management permission.

Migration 059 scopes live bus routes and trip logs to school administrators, assigned transport managers, and each route's assigned driver. Drivers may update trip status and live coordinates but cannot reassign routes or alter vehicle and route details. Family route visibility needs an explicit learner-to-route relationship before it can be safely granted.

Migration 060 requires an active same-school administrator or properly assigned teacher for class/subject actions, and blocks inactive teacher profiles from receiving new class assignments.

Migration 061 validates both the existing and replacement assignment-file storage paths against the uploader's learner, school, and class relationship, and blocks replacing files after an assignment closes.

Migration 062 validates driver-updated route status and geographic coordinates and sets the location update time on the server, preventing forged timestamps and malformed location values.

Migration 063 prevents clients from forging the payroll approval session flag, requires approval to run through the audited security-definer RPC, and prevents the preparer from approving their own payroll.

Migration 064 prevents principals from approving payroll runs that include their own salary, blocks approval of salary changes by the creator or beneficiary, and requires a different finance officer to confirm a payout than the initiator or beneficiary.

Migration 065 prevents expense creators from approving their own expenses, restricts approval and voiding to principals, locks approval evidence, and lets Finance mark approved expenses paid with a server-set timestamp.

Migration 066 validates driver trip-log event types and coordinate pairs, confirms the driver is assigned to the route, and sets log timestamps on the server.

Migration 067 reserves timetable changes for school administrators, principals, and assigned heads of department. Teachers, students, parents, and deputy principals retain read-only timetable access. Specialist-only accounts are routed to their assigned workspaces rather than teacher tools.

Migration 068 extends staff attendance access to assigned non-teaching staff. Migration 069 supports staff role assignments. Migration 070 rate-limits public admissions submissions, and migration 071 records staff-attendance audit events. Migration 072 allows teachers and staff with one matching specialist role into HR or Finance; each account is blocked from the other portal. Migration 073 keeps lesson attachments private and scopes uploads and signed downloads to authorized school/class lessons. Migration 074 records one free trial per school and enforces its 14-day limit.

## Manual role-access verification before production

Use separate accounts and two schools. Ensure each account has only the relationships listed here, then verify the action in the UI and with direct Supabase client calls (RLS must reject direct calls too):

- A teacher assigned to Class A / Mathematics can create and grade its assignments and results. A teacher assigned only to another subject cannot read or grade those submissions/results, change assignment ownership, or add a cross-school class/subject.
- A student can see only published work for their class, submit written work or an allowed file before the school's local due date, revise their own ungraded work, and cannot change grades or another student's submission. A graded submission cannot be changed by its student.
- A parent can see published classwork/results only for linked learners. An unrelated parent cannot read either learner's data.
- Inventory readers can see only their own school's assets when their account has the inventory-view permission; inventory managers can change records, while unrelated staff and learner/parent accounts cannot query asset values or serial numbers.
- HR can prepare and submit payroll but cannot approve it by setting `app.hr_payroll_approval`; only a different, MFA-verified principal can approve/reject through the RPC, and the approval plus audit rows must be recorded.
- A principal who is included as a payroll beneficiary cannot approve that run or their own salary change; a finance officer cannot confirm their own payroll item or a payout they initiated.
- Expense creators cannot approve their own entries; only principals approve or void expenses, and Finance can mark an approved expense paid without changing its approval evidence.
- Teachers, students, parents, and deputy principals cannot insert, update, or delete timetable rows. School administrators, principals, and assigned heads of department can manage schedules.
- A teacher without the `school.wellbeing.manage` permission cannot read reports or counselling notes. The counsellor can read/manage reports in their school and only edit notes they authored; students can read their own submitted report.
- A notification recipient can change only `is_read`; editing title/body/recipient or school must fail. The delivery worker should cancel opted-out jobs, retry transient webhook failures, stop after bounded attempts, and deliver an idempotent event after a webhook timeout/retry.
- Two schools cannot access one another's records or assignment files. Students cannot fetch another school's object by changing the Storage path.
- Assigned teachers and staff can open their HR or Finance portal, but cannot open both. School administrators remain in the school admin workspace. Confirm unassigned and cross-portal direct URL attempts are rejected.
- Lesson attachment uploads and signed downloads work only for the assigned teacher, enrolled learner viewing a published lesson, or school administrator in that school. A different class and school must be denied.

Record the account IDs, migration version, date, and pass/fail per check in the deployment record. The SQL tenant-isolation script does not simulate all role combinations; these authenticated role checks are required.

## Remaining service work

The outbox is a delivery foundation, not a functioning external messaging service until a trusted webhook adapter, provider credentials, and scheduled invocation are deployed. Provider receipts and escalation still depend on vendor integration. Payment checkout/webhooks likewise need a selected provider and server-side signature verification. No public API-key or webhook-secret storage is added to the browser or database.

Data export currently covers the common personal account and learner records; it does not replace a formal school-wide export or verified account-erasure process. Retention durations and deletion should be approved against school and jurisdiction requirements before an automated purge worker is introduced. The existing analytics, question bank, quiz moderation, second marking, integrity events, and offline attendance/grade tools remain the starting point for the advanced learning and reporting features.

## Security review checklist for each migration

- Confirm every new public table has RLS enabled and explicit least-privilege policies.
- Test two schools against each other's IDs, including nested/related records and RPC parameters.
- Check every `SECURITY DEFINER` function for a fixed `search_path`, role/tenant checks, revoked public execution, and the narrowest possible grants.
- Ensure service-role keys stay in server secrets; verify Edge Function CORS and request size/rate limits.
- Check audit events for accidental storage of passwords, tokens, message bodies, or unnecessary student personal data.
- Review indexes for tenant, relationship, and common date filters; review retention and backup recovery before production rollout.
