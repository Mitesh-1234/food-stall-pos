import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import crypto from "node:crypto";

const db = getFirestore();

export const startSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const uid = request.auth.uid;
  const deviceLabel = String(request.data?.deviceLabel ?? "Unknown device");
  const sessionId = crypto.randomUUID();

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);

    if (!userSnap.exists || userSnap.data()?.isActive !== true) {
      throw new HttpsError("permission-denied", "User is inactive or not registered.");
    }

    const oldSessionId = userSnap.data()?.activeSessionId as string | undefined;

    if (oldSessionId) {
      tx.update(db.doc(`sessions/${oldSessionId}`), {
        active: false,
        invalidatedAt: FieldValue.serverTimestamp(),
        invalidatedReason: "NEW_LOGIN"
      });
    }

    tx.set(db.doc(`sessions/${sessionId}`), {
      uid,
      deviceLabel,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp()
    });

    tx.update(userRef, {
      activeSessionId: sessionId,
      updatedAt: FieldValue.serverTimestamp()
    });

    tx.create(db.collection("activityLogs").doc(), {
      uid,
      action: "LOGIN_SESSION_CREATED",
      entityType: "USER",
      entityId: uid,
      details: { sessionId, deviceLabel },
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return { sessionId };
});

export const invalidateSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const uid = request.auth.uid;
  const sessionId = String(request.data?.sessionId ?? "");

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);

    if (!userSnap.exists || userSnap.data()?.activeSessionId !== sessionId) {
      return;
    }

    tx.update(db.doc(`sessions/${sessionId}`), {
      active: false,
      invalidatedAt: FieldValue.serverTimestamp(),
      invalidatedReason: "USER_LOGOUT"
    });

    tx.update(userRef, {
      activeSessionId: null,
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

export async function requireActiveSession(
  uid: string,
  sessionId: unknown,
  permission?: string
) {
  const sid = String(sessionId ?? "");
  if (!sid) throw new HttpsError("permission-denied", "Session required.");

  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found.");

  const user = userSnap.data()!;
  if (user.isActive !== true || user.activeSessionId !== sid) {
    throw new HttpsError("permission-denied", "Session is no longer active.");
  }

  if (permission && !(user.permissionCodes ?? []).includes(permission)) {
    throw new HttpsError("permission-denied", `Missing permission: ${permission}`);
  }

  return user;
}
