"use client";

import { useEffect, useState } from "react";
import {
  getAuthToken,
  setAuthSession,
  clearAuthSession,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export default function SessionStartPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        /*
         * Authentication is stored per browser tab
         * using sessionStorage.
         */
        const token = getAuthToken();

        if (!token) {
          window.location.replace("/login");
          return;
        }

        const response = await fetch(
          `${API_BASE_URL}/api/auth/me`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          clearAuthSession();

          if (!cancelled) {
            setError(
              data?.error ??
                "Session is no longer valid.",
            );
          }

          return;
        }

        /*
         * Backend is the source of truth.
         *
         * Keep the original authentication token,
         * but refresh the user information returned
         * by the backend.
         */
        const sessionId =
          data?.sessionId ??
          data?.user?.sessionId ??
          null;

        setAuthSession({
          token,
          user: {
            id: String(data.user.id),
            name: String(data.user.name),
            permissions:
              Array.isArray(
                data.user.permissions,
              )
                ? data.user.permissions.map(
                    String,
                  )
                : [],
          },
          sessionId,
        });

        /*
         * Prevent a redirect if the component has
         * already been unmounted.
         */
        if (cancelled) {
          return;
        }

        /*
         * replace() prevents the temporary
         * session-start page from remaining in
         * browser history.
         */
        window.location.replace("/orders");
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Could not verify session.",
        );
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "#f9fafb",
      }}
    >
      {error ? (
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            textAlign: "center",
            boxShadow:
              "0 10px 30px rgba(0,0,0,.08)",
          }}
        >
          <p
            style={{
              color: "#dc2626",
              marginBottom: 16,
            }}
          >
            {error}
          </p>

          <button
            type="button"
            onClick={() => {
              clearAuthSession();
              window.location.replace(
                "/login",
              );
            }}
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: 10,
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Login
          </button>
        </div>
      ) : (
        <p>Signing you in...</p>
      )}
    </main>
  );
}