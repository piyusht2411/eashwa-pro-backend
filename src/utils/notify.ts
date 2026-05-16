import * as admin from "firebase-admin";
import User from "../model/user";
import Notification from "../model/notification";

/**
 * Persist a notification record in the DB so the in-app notification feed has it.
 * Silently swallows errors so it never breaks the main flow.
 */
export const createNotificationRecord = async (
  recipientId: any,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  try {
    if (!recipientId) return;
    await Notification.create({
      recipient: recipientId,
      type,
      title,
      body,
      data: data ?? {},
    });
  } catch (err) {
    console.error("[notify] DB notification write failed:", err);
  }
};

/**
 * Send a Firebase push notification to a single user by userId.
 * Also writes a Notification DB record for the in-app feed.
 * Silently swallows errors so it never breaks the main flow.
 */
export const sendPushNotification = async (
  userId: any,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  const type = data?.type ?? "general";
  // DB write runs in parallel with FCM send
  const dbWrite = createNotificationRecord(userId, type, title, body, data);

  try {
    const user = await User.findById(userId).select("fcmToken name");
    if (!user || !user.fcmToken) {
      await dbWrite;
      return;
    }

    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      data: data ?? {},
      android: { priority: "high" },
      apns: {
        payload: {
          aps: { sound: "default", badge: 1 },
        },
      },
    });
  } catch (err) {
    console.error("[notify] FCM push failed:", err);
  }

  await dbWrite;
};

/**
 * Send push notification to multiple users by their userIds.
 */
export const sendPushNotificationToMany = async (
  userIds: any[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  await Promise.allSettled(
    userIds.map((uid) => sendPushNotification(uid, title, body, data))
  );
};
