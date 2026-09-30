"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeStaffPin = exports.createStaffUser = exports.loginWithPin = void 0;
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const https_1 = require("firebase-functions/v2/https");
const node_crypto_1 = require("node:crypto");
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)();
const PIN_SECRET = process.env.PIN_LOOKUP_SECRET;
function getPinSecret() {
    if (!PIN_SECRET) {
        throw new Error("PIN_LOOKUP_SECRET is not configured.");
    }
    return PIN_SECRET;
}
/**
 * Creates a deterministic lookup value.
 *
 * We use this only to find the user.
 * The actual PIN is verified using the salted scrypt hash.
 */
function createPinLookup(pin) {
    return (0, node_crypto_1.createHmac)("sha256", getPinSecret())
        .update(pin)
        .digest("hex");
}
/**
 * Securely hash a PIN.
 */
function hashPin(pin) {
    const salt = (0, node_crypto_1.randomBytes)(16);
    const derivedKey = (0, node_crypto_1.scryptSync)(pin, salt, 64);
    return [
        salt.toString("hex"),
        derivedKey.toString("hex"),
    ].join(":");
}
/**
 * Verify a PIN against the stored hash.
 */
function verifyPin(pin, storedHash) {
    const [saltHex, keyHex] = storedHash.split(":");
    if (!saltHex || !keyHex) {
        return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const expectedKey = Buffer.from(keyHex, "hex");
    const actualKey = (0, node_crypto_1.scryptSync)(pin, salt, expectedKey.length);
    return (0, node_crypto_1.timingSafeEqual)(expectedKey, actualKey);
}
/**
 * Basic PIN validation.
 */
function validatePin(pin) {
    const value = String(pin ?? "");
    if (!/^\d{6}$/.test(value)) {
        throw new https_1.HttpsError("invalid-argument", "PIN must contain exactly 6 digits.");
    }
    return value;
}
/**
 * LOGIN
 *
 * PIN -> find user -> verify PIN -> Firebase custom token
 */
exports.loginWithPin = (0, https_1.onCall)(async (request) => {
    const pin = validatePin(request.data?.pin);
    const lookup = createPinLookup(pin);
    const snapshot = await db
        .collection("users")
        .where("pinLookup", "==", lookup)
        .limit(1)
        .get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("unauthenticated", "Invalid PIN.");
    }
    const userDoc = snapshot.docs[0];
    const user = userDoc.data();
    if (user.isActive !== true) {
        throw new https_1.HttpsError("permission-denied", "This user account is inactive.");
    }
    const valid = verifyPin(pin, user.pinHash);
    if (!valid) {
        throw new https_1.HttpsError("unauthenticated", "Invalid PIN.");
    }
    /**
     * Create Firebase Auth account if it doesn't exist.
     *
     * The Firestore user document remains our application user.
     */
    let firebaseUser;
    try {
        firebaseUser = await auth.getUser(userDoc.id);
    }
    catch {
        firebaseUser = await auth.createUser({
            uid: userDoc.id,
            displayName: user.name ?? "POS User",
            disabled: false,
        });
    }
    const customToken = await auth.createCustomToken(firebaseUser.uid);
    await db.collection("activityLogs").add({
        uid: userDoc.id,
        action: "PIN_LOGIN_SUCCESS",
        entityType: "USER",
        entityId: userDoc.id,
        details: {},
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        customToken,
        uid: userDoc.id,
        name: user.name,
        permissionCodes: user.permissionCodes ?? [],
    };
});
/**
 * CREATE STAFF USER
 *
 * Admin creates the user and assigns permissions.
 */
exports.createStaffUser = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required.");
    }
    const caller = await db
        .doc(`users/${request.auth.uid}`)
        .get();
    if (!caller.exists ||
        caller.data()?.isActive !== true ||
        !(caller.data()?.permissionCodes ?? [])
            .includes("MANAGE_USERS")) {
        throw new https_1.HttpsError("permission-denied", "You do not have permission to manage users.");
    }
    const { name, pin, permissionCodes, } = request.data ?? {};
    if (!name) {
        throw new https_1.HttpsError("invalid-argument", "Name is required.");
    }
    const cleanPin = validatePin(pin);
    if (!Array.isArray(permissionCodes)) {
        throw new https_1.HttpsError("invalid-argument", "Permissions are required.");
    }
    const pinLookup = createPinLookup(cleanPin);
    const existing = await db
        .collection("users")
        .where("pinLookup", "==", pinLookup)
        .limit(1)
        .get();
    if (!existing.empty) {
        throw new https_1.HttpsError("already-exists", "That PIN is already assigned.");
    }
    const uid = db.collection("users").doc().id;
    await db.doc(`users/${uid}`).set({
        name: String(name),
        pinLookup,
        pinHash: hashPin(cleanPin),
        isActive: true,
        permissionCodes,
        activeSessionId: null,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await db
        .collection("activityLogs")
        .add({
        uid: request.auth.uid,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: uid,
        details: {
            name,
            permissionCodes,
        },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        uid,
        name,
    };
});
/**
 * CHANGE STAFF PIN
 */
exports.changeStaffPin = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required.");
    }
    const caller = await db
        .doc(`users/${request.auth.uid}`)
        .get();
    if (!caller.exists ||
        !(caller.data()?.permissionCodes ?? [])
            .includes("MANAGE_USERS")) {
        throw new https_1.HttpsError("permission-denied", "You do not have permission to manage users.");
    }
    const { userId, newPin, } = request.data ?? {};
    const cleanPin = validatePin(newPin);
    const userRef = db.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new https_1.HttpsError("not-found", "User not found.");
    }
    const lookup = createPinLookup(cleanPin);
    const existing = await db
        .collection("users")
        .where("pinLookup", "==", lookup)
        .limit(1)
        .get();
    if (!existing.empty &&
        existing.docs[0].id !== userId) {
        throw new https_1.HttpsError("already-exists", "That PIN is already assigned.");
    }
    await userRef.update({
        pinLookup: lookup,
        pinHash: hashPin(cleanPin),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await db
        .collection("activityLogs")
        .add({
        uid: request.auth.uid,
        action: "USER_PIN_CHANGED",
        entityType: "USER",
        entityId: userId,
        details: {},
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        ok: true,
    };
});
