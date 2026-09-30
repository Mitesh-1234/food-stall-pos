const KEYS = {
  token: "posAuthToken",
  userName: "posUserName",
  userId: "posUserId",
  sessionId: "posSessionId",
  permissions: "posPermissions",
} as const;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

export function getAuthToken(): string {
  return (
    getStorage()?.getItem(KEYS.token) ??
    ""
  );
}

export function getUserName(): string {
  return (
    getStorage()?.getItem(KEYS.userName) ??
    ""
  );
}

export function getUserId(): string {
  return (
    getStorage()?.getItem(KEYS.userId) ??
    ""
  );
}

export function getSessionId(): string {
  return (
    getStorage()?.getItem(KEYS.sessionId) ??
    ""
  );
}

export function getPermissions(): string[] {
  const raw =
    getStorage()?.getItem(
      KEYS.permissions,
    );

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.map(String)
      : [];
  } catch {
    return [];
  }
}

export function setAuthSession(data: {
  token: string;
  user: {
    id: string;
    name: string;
    permissions?: string[];
  };
  sessionId?: string | null;
}) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(
    KEYS.token,
    data.token,
  );

  storage.setItem(
    KEYS.userName,
    data.user.name,
  );

  storage.setItem(
    KEYS.userId,
    data.user.id,
  );

  storage.setItem(
    KEYS.permissions,
    JSON.stringify(
      data.user.permissions ?? [],
    ),
  );

  if (data.sessionId) {
    storage.setItem(
      KEYS.sessionId,
      data.sessionId,
    );
  } else {
    storage.removeItem(
      KEYS.sessionId,
    );
  }
}

export function clearAuthSession() {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(KEYS.token);
  storage.removeItem(KEYS.userName);
  storage.removeItem(KEYS.userId);
  storage.removeItem(KEYS.sessionId);
  storage.removeItem(KEYS.permissions);
}

export function hasAuthSession(): boolean {
  return Boolean(getAuthToken());
}