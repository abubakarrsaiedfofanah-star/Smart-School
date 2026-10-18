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

1. Apply migrations `034_notification_delivery_outbox.sql` through `042_workflow_access_and_delivery.sql` in numerical order.
2. Set the Supabase Edge Function secret. Example: `supabase secrets set SMARTSCHOOL_ALLOWED_ORIGINS="https://school.example,https://www.school.example"`. Add `http://localhost:5173` only in a development project. Add `capacitor://localhost` only when using that native origin.
3. Set `NOTIFICATION_WORKER_SECRET`, `NOTIFICATION_DELIVERY_WEBHOOK_URL` (HTTPS), and `NOTIFICATION_DELIVERY_WEBHOOK_SECRET` as Edge Function secrets. Deploy with `supabase functions deploy deliver-notifications`. Its `config.toml` disables Supabase JWT verification for that function; the worker verifies its own high-entropy bearer secret.
4. Configure the trusted webhook adapter. It receives a JSON `smartschool.notification` event and an `X-SmartSchool-Timestamp` plus `X-SmartSchool-Signature: v1=<hex>` HMAC-SHA256 signature over `<timestamp>.<raw request body>`. Verify the signature in constant time, reject stale timestamps (for example, older than five minutes), use `delivery_id` as the provider idempotency key, and return 2xx only after the provider accepted the message. Do not log payload bodies, recipient addresses, tokens, or message content. Protect the adapter endpoint with provider-specific quotas and alerting.
5. Invoke the worker from a trusted scheduler every minute with `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>` and a small JSON body such as `{"limit":25}`. Restrict access to the scheduler. Monitor returned claimed/sent/failed/cancelled counts and terminal outbox failures. Push delivery also needs native APNS/FCM credentials and a provider adapter; database token registration alone does not deliver push messages.
6. In Supabase Auth, enable TOTP MFA and configure the assurance policy appropriate to the school. The frontend challenges users with an enrolled factor; privileged database changes also require MFA at the database layer.

## Manual role-access verification before production

Use separate accounts and two schools. Ensure each account has only the relationships listed here, then verify the action in the UI and with direct Supabase client calls (RLS must reject direct calls too):

- A teacher assigned to Class A / Mathematics can create and grade its assignments and results. A teacher assigned only to another subject cannot read or grade those submissions/results, change assignment ownership, or add a cross-school class/subject.
- A student can see only published work for their class, submit written work or an allowed file before the school's local due date, revise their own ungraded work, and cannot change grades or another student's submission. A graded submission cannot be changed by its student.
- A parent can see published classwork/results only for linked learners. An unrelated parent cannot read either learner's data.
- A teacher without the `school.wellbeing.manage` permission cannot read reports or counselling notes. The counsellor can read/manage reports in their school and only edit notes they authored; students can read their own submitted report.
- A notification recipient can change only `is_read`; editing title/body/recipient or school must fail. The delivery worker should cancel opted-out jobs, retry transient webhook failures, stop after bounded attempts, and deliver an idempotent event after a webhook timeout/retry.
- Two schools cannot access one another's records or assignment files. Students cannot fetch another school's object by changing the Storage path.

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
