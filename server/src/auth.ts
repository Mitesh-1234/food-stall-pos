import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "./db.js";

const SESSION_DURATION_HOURS = 12;

function createPinLookup(pin: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(pin)
    .digest("hex");
}

function createSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getPinLookupSecret(): string {
  const secret = process.env.PIN_LOOKUP_SECRET;

  if (!secret) {
    throw new Error("PIN_LOOKUP_SECRET is not configured");
  }

  return secret;
}

export type AuthenticatedUser = {
  id: string;
  name: string;
  permissions: string[];
};

export type LoginResult = {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

/**
 * Login using the staff member's unique 6-digit PIN.
 *
 * The plaintext PIN:
 * - is received only by the backend
 * - is never stored
 * - is never logged
 *
 * Database stores:
 * - HMAC lookup value
 * - bcrypt hash
 */
export async function loginWithPin(
  pin: string,
): Promise<LoginResult> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN must contain exactly 6 digits");
  }

  const pinLookup = createPinLookup(
    pin,
    getPinLookupSecret(),
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // --------------------------------------------------------
    // Find staff member
    // --------------------------------------------------------

    const userResult = await client.query(
      `
      SELECT
        id,
        name,
        status,
        pin_hash,
        active_session_id
      FROM users
      WHERE pin_lookup = $1
      LIMIT 1
      `,
      [pinLookup],
    );

    if (userResult.rowCount === 0) {
      throw new AuthError(
        "Invalid PIN",
        401,
      );
    }

    const user = userResult.rows[0];

    // --------------------------------------------------------
    // Account status
    // --------------------------------------------------------

    if (user.status !== "ACTIVE") {
      throw new AuthError(
        "Staff account is inactive",
        403,
      );
    }

    // --------------------------------------------------------
    // Verify bcrypt hash
    // --------------------------------------------------------

    const validPin = await bcrypt.compare(
      pin,
      user.pin_hash,
    );

    if (!validPin) {
      throw new AuthError(
        "Invalid PIN",
        401,
      );
    }

    // --------------------------------------------------------
    // Get permissions
    // --------------------------------------------------------

    const permissionResult = await client.query(
      `
      SELECT permission
      FROM user_permissions
      WHERE user_id = $1
      ORDER BY permission
      `,
      [user.id],
    );

    const permissions = permissionResult.rows.map(
      (row) => row.permission as string,
    );

    // --------------------------------------------------------
    // Generate new session
    // --------------------------------------------------------

    const sessionToken = createSessionToken();

    const sessionTokenHash =
      hashSessionToken(sessionToken);

    const expiresAt = new Date(
      Date.now() +
        SESSION_DURATION_HOURS *
          60 *
          60 *
          1000,
    );

    // --------------------------------------------------------
    // Invalidate previous session
    // --------------------------------------------------------

    if (user.active_session_id) {
      await client.query(
        `
        UPDATE sessions
        SET
          is_active = false,
          invalidated_at = now(),
          invalidation_reason = 'NEW_LOGIN'
        WHERE id = $1
          AND is_active = true
        `,
        [user.active_session_id],
      );
    }

    // --------------------------------------------------------
    // Create new session
    // --------------------------------------------------------

    const sessionResult = await client.query(
      `
      INSERT INTO sessions (
        user_id,
        token_hash,
        is_active,
        expires_at,
        last_seen_at
      )
      VALUES ($1, $2, true, $3, now())
      RETURNING id
      `,
      [
        user.id,
        sessionTokenHash,
        expiresAt,
      ],
    );

    const sessionId =
      sessionResult.rows[0].id;

    // --------------------------------------------------------
    // Make this user's newest session authoritative
    // --------------------------------------------------------

    await client.query(
      `
      UPDATE users
      SET
        active_session_id = $1,
        updated_at = now()
      WHERE id = $2
      `,
      [
        sessionId,
        user.id,
      ],
    );

    // --------------------------------------------------------
    // Audit login
    // --------------------------------------------------------

    await client.query(
      `
      INSERT INTO activity_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        $1,
        'LOGIN',
        'USER',
        $1,
        $2::jsonb
      )
      `,
      [
        user.id,
        JSON.stringify({
          session_id: sessionId,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      token: sessionToken,
      expiresAt:
        expiresAt.toISOString(),
      user: {
        id: user.id,
        name: user.name,
        permissions,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate a session token.
 *
 * A session is valid only when:
 *
 * 1. Token hash exists
 * 2. Session is active
 * 3. Session isn't expired
 * 4. Session belongs to the user's current
 *    active_session_id
 * 5. User is ACTIVE
 */
export async function authenticateSession(
  token: string,
): Promise<AuthenticatedUser & {
  sessionId: string;
}> {
  if (!token) {
    throw new AuthError(
      "Authentication required",
      401,
    );
  }

  const tokenHash =
    hashSessionToken(token);

  const result = await pool.query(
    `
    SELECT
      s.id AS session_id,
      u.id AS user_id,
      u.name,
      u.status
    FROM sessions s
    INNER JOIN users u
      ON u.id = s.user_id
    WHERE s.token_hash = $1
      AND s.is_active = true
      AND s.expires_at > now()
      AND u.active_session_id = s.id
      AND u.status = 'ACTIVE'
    LIMIT 1
    `,
    [tokenHash],
  );

  if (result.rowCount === 0) {
    throw new AuthError(
      "Session is invalid or expired",
      401,
    );
  }

  const session = result.rows[0];

  // Update activity without affecting authentication.
  await pool.query(
    `
    UPDATE sessions
    SET last_seen_at = now()
    WHERE id = $1
    `,
    [session.session_id],
  );

  const permissionResult =
    await pool.query(
      `
      SELECT permission
      FROM user_permissions
      WHERE user_id = $1
      ORDER BY permission
      `,
      [session.user_id],
    );

  return {
    id: session.user_id,
    name: session.name,
    permissions:
      permissionResult.rows.map(
        (row) => row.permission as string,
      ),
    sessionId: session.session_id,
  };
}

/**
 * Logout the current session.
 */
export async function logout(
  token: string,
): Promise<void> {
  const tokenHash =
    hashSessionToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sessionResult =
      await client.query(
        `
        SELECT
          id,
          user_id
        FROM sessions
        WHERE token_hash = $1
          AND is_active = true
        LIMIT 1
        `,
        [tokenHash],
      );

    if (sessionResult.rowCount === 0) {
      await client.query("COMMIT");
      return;
    }

    const session =
      sessionResult.rows[0];

    await client.query(
      `
      UPDATE sessions
      SET
        is_active = false,
        invalidated_at = now(),
        invalidation_reason = 'LOGOUT'
      WHERE id = $1
      `,
      [session.id],
    );

    await client.query(
      `
      UPDATE users
      SET
        active_session_id = NULL,
        updated_at = now()
      WHERE id = $1
        AND active_session_id = $2
      `,
      [
        session.user_id,
        session.id,
      ],
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        $1,
        'LOGOUT',
        'USER',
        $1,
        $2::jsonb
      )
      `,
      [
        session.user_id,
        JSON.stringify({
          session_id: session.id,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check whether an authenticated user has
 * a required permission.
 */
export function requirePermission(
  permissions: string[],
  requiredPermission: string,
): void {
  if (
    !permissions.includes(requiredPermission)
  ) {
    throw new AuthError(
      "Permission denied",
      403,
    );
  }
}

export class AuthError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}