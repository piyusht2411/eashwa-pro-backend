import * as admin from "firebase-admin";
import User from "../model/user";

/**
 * Send a Firebase push notification to a single user by userId.
 * Silently swallows errors so it never breaks the main flow.
 */
export const sendPushNotification = async (
  userId: any,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  try {
    const user = await User.findById(userId).select("fcmToken name");
    if (!user || !user.fcmToken) return;

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
