import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import toast from 'react-hot-toast';

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
export async function initPushNotifications() {
  try {
    // Check current permission status
    let permStatus = await PushNotifications.checkPermissions();

    // Request permissions if not already granted or denied
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    // Register the device with the push notification service (APNS/FCM)
    await PushNotifications.register();

    // Listen for successful registration and log the token
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success. Token:', token.value);
      // Note: This token would typically be saved to Supabase under the user's profile
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    // Handle incoming notifications while the app is in the foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received in foreground:', notification);
    });

    // Handle user actions performed on notifications (e.g., tapping the notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action performed:', action);
    });

  } catch (error) {
    console.error('Error during push notification initialization:', error);
  }
}
