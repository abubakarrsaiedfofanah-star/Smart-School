import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { supabase } from './supabase';

/**
 * Sends a local notification (e.g., for attendance alerts).
 */
export async function sendAttendanceAlert(studentName) {
  try {
    const title = 'Attendance Alert';
    const body = `${studentName} was marked ABSENT today.`;

    // Local notification for the app shell
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + 1000) },
          sound: null,
          attachments: null,
          actionTypeId: '',
          extra: null,
        },
      ],
    });

    // Also show a toast for immediate feedback
    toast.error(body, { duration: 5000, icon: '🚨' });
  } catch (e) {
    console.error('Failed to send local notification', e);
    toast.error(`${studentName} marked absent.`);
  }
}

/**
 * Schedules a local notification for a calendar event.
 */
export async function scheduleEventReminder(event) {
  try {
    const eventDate = new Date(event.event_date);
    const reminderDate = new Date(eventDate.getTime() - (1000 * 60 * 60)); // 1 hour before

    if (reminderDate < new Date()) {
       toast.error('Cannot schedule reminder for past events.');
       return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          title: `Reminder: ${event.title}`,
          body: `Starts in 1 hour at ${eventDate.toLocaleTimeString()}`,
          id: Math.floor(Math.random() * 10000),
          schedule: { at: reminderDate },
          sound: null,
          attachments: null,
          actionTypeId: '',
          extra: null,
        },
      ],
    });

    toast.success(`Reminder set for ${event.title}!`, { icon: '⏰' });
  } catch (e) {
    console.error('Failed to schedule event reminder', e);
    toast.error('Failed to set reminder.');
  }
}

/**
 * Initializes Push Notifications for the Capacitor app.
 * Requests permissions, registers the device, logs the token,
 * and sets up event listeners for notification events.
 */
export async function initPushNotifications(profile) {
  if (!Capacitor.isNativePlatform() || !profile?.id || !profile?.school_id || !supabase) return () => {};
  const handles = [];
  let disposed = false;
  const cleanup = () => { disposed = true; for (const handle of handles) void handle.remove(); };
  try {
    // Check current permission status
    let permStatus = await PushNotifications.checkPermissions();

    // Request permissions if not already granted or denied
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return cleanup;
    }

    handles.push(await PushNotifications.addListener('registration', async token => {
      if (disposed) return;
      const { error } = await supabase.from('push_devices').upsert({
        school_id: profile.school_id, user_id: profile.id, device_token: token.value,
        platform: Capacitor.getPlatform(), active: true
      }, { onConflict: 'user_id,device_token' });
      if (error) console.error('Push device registration could not be saved.');
    }));
    handles.push(await PushNotifications.addListener('registrationError', () => {
      console.error('Push registration error.');
    }));

    // Handle incoming notifications while the app is in the foreground
    handles.push(await PushNotifications.addListener('pushNotificationReceived', () => {
      // Keep notification contents out of application logs.
    }));

    // Handle user actions performed on notifications (e.g., tapping the notification)
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // Notification destinations can be handled here without logging their payload.
    }));
    await PushNotifications.register();
    if (disposed) cleanup();
    return cleanup;

  } catch (error) {
    console.error('Error during push notification initialization:', error);
    cleanup();
    return cleanup;
  }
}
