"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateSession = exports.startSession = void 0;
exports.requireActiveSession = requireActiveSession;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const node_crypto_1 = __importDefault(require("node:crypto"));
const db = (0, firestore_1.getFirestore)();
exports.startSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const deviceLabel = String(request.data?.deviceLabel ?? "Unknown device");
    const sessionId = node_crypto_1.default.randomUUID();
    await db.runTransaction(async (tx) => {
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists || userSnap.data()?.isActive !== true) {
            throw new https_1.HttpsError("permission-denied", "User is inactive or not registered.");
        }
        const oldSessionId = userSnap.data()?.activeSessionId;
        if (oldSessionId) {
            tx.update(db.doc(`sessions/${oldSessionId}`), {
                active: false,
                invalidatedAt: firestore_1.FieldValue.serverTimestamp(),
                invalidatedReason: "NEW_LOGIN"
            });
        }
        tx.set(db.doc(`sessions/${sessionId}`), {
            uid,
            deviceLabel,
            active: true,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            lastSeenAt: firestore_1.FieldValue.serverTimestamp()
        });
        tx.update(userRef, {
            activeSessionId: sessionId,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        tx.create(db.collection("activityLogs").doc(), {
            uid,
            action: "LOGIN_SESSION_CREATED",
            entityType: "USER",
            entityId: uid,
            details: { sessionId, deviceLabel },
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
    });
    return { sessionId };
});
exports.invalidateSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required.");
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
            invalidatedAt: firestore_1.FieldValue.serverTimestamp(),
            invalidatedReason: "USER_LOGOUT"
        });
        tx.update(userRef, {
            activeSessionId: null,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
    });
    return { ok: true };
});
async function requireActiveSession(uid, sessionId, permission) {
    const sid = String(sessionId ?? "");
    if (!sid)
        throw new https_1.HttpsError("permission-denied", "Session required.");
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists)
        throw new https_1.HttpsError("permission-denied", "User not found.");
    const user = userSnap.data();
    if (user.isActive !== true || user.activeSessionId !== sid) {
        throw new https_1.HttpsError("permission-denied", "Session is no longer active.");
    }
    if (permission && !(user.permissionCodes ?? []).includes(permission)) {
        throw new https_1.HttpsError("permission-denied", `Missing permission: ${permission}`);
    }
    return user;
}
