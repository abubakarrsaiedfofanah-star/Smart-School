# Product improvements

## Included

- Teacher attendance can be recorded in a mobile-friendly class roster, with a bulk “mark all present” action.
- Attendance and grade entries can be queued in IndexedDB while offline and sync when the signed-in user reconnects. The queue is scoped to the user and school. A loaded class list is cached on that device for up to 24 hours; pending writes expire after 14 days.
- Student report cards show weighted averages by subject and use each school's configured grade boundaries.
- School administrators can set a school time zone, currency, academic term names, and percentage-to-grade boundaries.
- Families and staff can choose English or Kiswahili and manage in-app alert preferences.
- Database triggers create in-app notices for absences, school announcements, class assignments, exams, published results, and behavior updates. Sensitive school changes are written to the existing audit log.

## Database rollout

Apply `supabase/030_school_localization_and_family_alerts.sql` after migration 029, then deploy the frontend. The migration expects the existing notifications, guardian links, school audit log, assignments, exams, and published-result schema from migrations 001–029.

## Delivery channels

These alerts currently appear in the SmartSchool notification center. SMS, WhatsApp, email, and remote push delivery still need a configured provider and server-side credentials; no provider credentials are present in this workspace. Event reminders can be set in the calendar on the current device.

Offline data is stored in the browser's IndexedDB on the device that loaded the roster. Staff should use a device protected by a screen lock and reconnect before the pending-write expiry.
