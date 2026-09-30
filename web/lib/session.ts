import { onSnapshot, doc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase";

export function watchCurrentSession(sessionId: string, onInvalidated?: () => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  return onSnapshot(doc(db, "sessions", sessionId), async (snap) => {
    const data = snap.data();
    if (!snap.exists() || data?.active !== true) {
      onInvalidated?.();
      await signOut(auth);
    }
  });
}
