import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LoginRequest = {
  pin?: string;
};

Deno.serve(async (req) => {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // --------------------------------------------------------
    // Only POST is allowed
    // --------------------------------------------------------

    if (req.method !== "POST") {
      return json(
        {
          success: false,
          error: "Method not allowed",
        },
        405,
      );
    }

    // --------------------------------------------------------
    // Environment
    // --------------------------------------------------------

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    // IMPORTANT:
    // This client uses the service-role key ONLY inside the
    // Edge Function. It must NEVER be sent to the browser.
    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // --------------------------------------------------------
    // Parse request
    // --------------------------------------------------------

    const body = (await req.json()) as LoginRequest;

    const pin = body.pin?.trim();

    // Exactly six digits.
    if (!pin || !/^\d{6}$/.test(pin)) {
      return json(
        {
          success: false,
          error: "PIN must contain exactly 6 digits.",
        },
        400,
      );
    }

    // --------------------------------------------------------
    // Find user using deterministic PIN lookup
    // --------------------------------------------------------
    //
    // We DO NOT search by plaintext PIN.
    //
    // The database stores pin_lookup.
    //
    // For the first implementation we derive the lookup from
    // the server-side secret.
    //
    // The secret is never exposed to the browser.
    // --------------------------------------------------------

    const pinLookupSecret = Deno.env.get("PIN_LOOKUP_SECRET");

    if (!pinLookupSecret) {
      throw new Error("PIN_LOOKUP_SECRET is not configured");
    }

    const pinLookup = await createPinLookup(
      pin,
      pinLookupSecret,
    );

    const {
      data: user,
      error: userError,
    } = await admin
      .from("users")
      .select(
        `
          id,
          name,
          status,
          pin_hash,
          active_session_id
        `,
      )
      .eq("pin_lookup", pinLookup)
      .maybeSingle();

    if (userError) {
      console.error("User lookup failed:", userError);

      return json(
        {
          success: false,
          error: "Authentication service error.",
        },
        500,
      );
    }

    if (!user) {
      return json(
        {
          success: false,
          error: "Invalid PIN.",
        },
        401,
      );
    }

    // --------------------------------------------------------
    // Check whether staff account is active
    // --------------------------------------------------------

    if (user.status !== "ACTIVE") {
      return json(
        {
          success: false,
          error: "This staff account is inactive.",
        },
        403,
      );
    }

    // --------------------------------------------------------
    // Verify PIN hash
    // --------------------------------------------------------

    const validPin = await verifyPin(
      pin,
      user.pin_hash,
    );

    if (!validPin) {
      return json(
        {
          success: false,
          error: "Invalid PIN.",
        },
        401,
      );
    }

    // --------------------------------------------------------
    // Load permissions
    // --------------------------------------------------------

    const {
      data: permissions,
      error: permissionError,
    } = await admin
      .from("user_permissions")
      .select("permission")
      .eq("user_id", user.id);

    if (permissionError) {
      console.error(
        "Permission lookup failed:",
        permissionError,
      );

      return json(
        {
          success: false,
          error: "Unable to load user permissions.",
        },
        500,
      );
    }

    const permissionCodes =
      permissions?.map((item) => item.permission) ?? [];

    // --------------------------------------------------------
    // Create a Supabase Auth identity
    // --------------------------------------------------------
    //
    // We use the staff database UUID as the Auth user UUID.
    //
    // This gives us a stable identity for audit logging and
    // authorization.
    // --------------------------------------------------------

    let authUserId = user.id;

    const {
      data: existingAuthUser,
      error: existingAuthError,
    } = await admin.auth.admin.getUserById(user.id);

    if (
      existingAuthError ||
      !existingAuthUser.user
    ) {
      const {
        data: createdAuth,
        error: createAuthError,
      } = await admin.auth.admin.createUser({
        user_id: user.id,
        email: `staff-${user.id}@foodstall.local`,
        email_confirm: true,
        user_metadata: {
          staff_user_id: user.id,
          name: user.name,
        },
      });

      if (createAuthError) {
        console.error(
          "Auth user creation failed:",
          createAuthError,
        );

        return json(
          {
            success: false,
            error: "Unable to create authentication identity.",
          },
          500,
        );
      }

      authUserId = createdAuth.user.id;
    }

    // --------------------------------------------------------
    // Create a new POS session
    // --------------------------------------------------------

    const sessionId = crypto.randomUUID();

    // First invalidate any previous POS session.
    if (user.active_session_id) {
      await admin
        .from("sessions")
        .update({
          is_active: false,
          invalidated_at: new Date().toISOString(),
          invalidation_reason: "NEW_LOGIN",
        })
        .eq("id", user.active_session_id)
        .eq("is_active", true);
    }

    // Create the new POS session.
    const {
      error: sessionError,
    } = await admin
      .from("sessions")
      .insert({
        id: sessionId,
        user_id: user.id,
        is_active: true,
      });

    if (sessionError) {
      console.error(
        "Session creation failed:",
        sessionError,
      );

      return json(
        {
          success: false,
          error: "Unable to create POS session.",
        },
        500,
      );
    }

    // Point the user at the newest session.
    const {
      error: updateUserError,
    } = await admin
      .from("users")
      .update({
        active_session_id: sessionId,
      })
      .eq("id", user.id);

    if (updateUserError) {
      console.error(
        "Active session update failed:",
        updateUserError,
      );

      // Roll back the newly created session.
      await admin
        .from("sessions")
        .update({
          is_active: false,
          invalidated_at: new Date().toISOString(),
          invalidation_reason: "SESSION_SETUP_FAILED",
        })
        .eq("id", sessionId);

      return json(
        {
          success: false,
          error: "Unable to activate session.",
        },
        500,
      );
    }

    // --------------------------------------------------------
    // Audit login
    // --------------------------------------------------------

    await admin
      .from("activity_logs")
      .insert({
        user_id: user.id,
        action: "LOGIN",
        entity_type: "USER",
        entity_id: user.id,
        details: {
          session_id: sessionId,
        },
      });

    // --------------------------------------------------------
    // Return authenticated staff information
    // --------------------------------------------------------

    return json({
      success: true,
      user: {
        id: authUserId,
        name: user.name,
        permissions: permissionCodes,
      },
      session: {
        id: sessionId,
      },
    });
  } catch (error) {
    console.error("login-with-pin error:", error);

    return json(
      {
        success: false,
        error: "Unexpected authentication error.",
      },
      500,
    );
  }
});

// ============================================================
// Helpers
// ============================================================

async function createPinLookup(
  pin: string,
  secret: string,
): Promise<string> {
  const data = new TextEncoder().encode(
    `${secret}:${pin}`,
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(pin),
  );

  return Array.from(
    new Uint8Array(signature),
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    .join("");
}

async function verifyPin(
  pin: string,
  hash: string,
): Promise<boolean> {
  // Supabase/Postgres bcrypt verification will be
  // performed by a small RPC in the next step.
  //
  // We deliberately do not attempt to implement bcrypt
  // manually inside the Edge Function.

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase environment variables are missing",
    );
  }

  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await admin.rpc(
    "verify_staff_pin",
    {
      p_pin: pin,
      p_hash: hash,
    },
  );

  if (error) {
    console.error(
      "PIN verification failed:",
      error,
    );

    throw new Error(
      "PIN verification service failed",
    );
  }

  return data === true;
}

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}