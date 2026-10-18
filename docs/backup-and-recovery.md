# Backup and recovery runbook

Set an owner for backups, agree the recovery point objective (maximum acceptable data loss) and recovery time objective (maximum acceptable outage), and record the production Supabase project reference in your internal operations inventory. Do not put database passwords, service keys, backup files, student records, or recovery tokens in this repository.

## Automated platform backups

Check **Database → Backups** in the Supabase dashboard and confirm the production project's plan, most recent backup, retention, and restore access. Supabase currently provides daily backups on Pro, Team, and Enterprise plans; retention varies by plan. Point-in-Time Recovery is a paid add-on. A restore makes the project unavailable while it runs, so announce a maintenance window and follow the dashboard confirmation flow. Review the current [Supabase backup guide](https://supabase.com/docs/guides/platform/backups) before relying on plan features.

Database backups do not include the actual files stored through the Supabase Storage API. Keep a separate, encrypted copy of required objects and verify that the copy can be downloaded and restored. Preserve Auth and Storage configuration, Edge Function source and secrets inventory, DNS/app settings, and the ordered SQL migrations separately. Never export secrets into the same bucket as school data.

## Additional encrypted logical export

Use a secured operations machine with the Supabase CLI, Docker Desktop, and `psql` installed. Put the database connection string in a short-lived environment variable or approved secret manager; do not paste it into shell history or commit any output. Supabase's [CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) uses separate role, schema, and data dumps:

```powershell
$env:DB_URL = Read-Host "Enter the secured production database connection string"
supabase db dump --db-url $env:DB_URL -f roles.sql --role-only
supabase db dump --db-url $env:DB_URL -f schema.sql
supabase db dump --db-url $env:DB_URL -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
Remove-Item Env:DB_URL
```

Encrypt the three output files immediately, copy them to access-controlled offsite storage, record the export timestamp and checksum, then securely remove plaintext copies from the operations machine. These logical exports still do not contain Storage object bytes. Keep the required extensions, migration history, Auth/Storage configuration changes, and Realtime publication configuration in the recovery inventory.

## Restore and verify

1. Open an incident and stop writes or place the application into a maintenance state. Record the intended recovery time and preserve the incident evidence.
2. Restore to a separate recovery project first when feasible. Enable required extensions and configure Auth, Storage, and webhooks before restoring. Follow the current Supabase restore instructions; a production restore can require downtime.
3. Restore roles and schema before data, using `psql` with `--single-transaction` and `--variable ON_ERROR_STOP=1`. Restore Storage objects from their separate secured copy and reinstate the Edge Functions, secrets, Auth settings, and Realtime publications.
4. Apply no new migration to the recovered production project until the recovery owner compares the restored migration history with the repository migrations.
5. Verify sign-in and MFA, school tenant isolation, role permissions, student/guardian links, timetable visibility, assignment submission and grading, fee reconciliation, payroll approval, notification delivery, and representative Storage downloads with two test schools/accounts.
6. Record data loss window, downtime, verification results, and follow-up actions. Reopen writes only after the recovery owner approves the checks.

Run a restore drill to an isolated project before launch and at least quarterly after launch. Record actual restore duration against the agreed recovery objectives. Supabase platform restores may take the project offline; see its current [backup and restore notes](https://supabase.com/docs/guides/platform/backups) when scheduling the drill.
