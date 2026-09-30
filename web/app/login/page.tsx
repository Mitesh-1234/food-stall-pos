"use client";

import { useState } from "react";
import { setAuthSession } from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (pin.length !== 6) {
      setError("Enter your 6-digit PIN.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pin,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Invalid PIN.",
        );
      }

      /*
       * Store authentication in sessionStorage.
       *
       * This is intentionally NOT localStorage.
       * sessionStorage gives each browser tab its own
       * POS login session.
       */
      setAuthSession({
        token: data.token,
        user: {
          id: data.user.id,
          name: data.user.name,
          permissions: data.user.permissions ?? [],
        },
        sessionId: data.sessionId ?? null,
      });

      /*
       * Only redirect after the authentication session
       * has been successfully stored.
       */
      window.location.href = "/session-start";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid PIN.",
      );

      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function addDigit(digit: string) {
    if (loading || pin.length >= 6) {
      return;
    }

    setPin((current) => current + digit);
  }

  function removeDigit() {
    if (loading) {
      return;
    }

    setPin((current) =>
      current.slice(0, -1),
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 20,
          padding: 24,
          boxShadow:
            "0 10px 30px rgba(0,0,0,.08)",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Food Stall POS
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          Enter your PIN
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            margin: "25px 0",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map(
            (index) => (
              <div
                key={index}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background:
                    index < pin.length
                      ? "#111827"
                      : "#e5e7eb",
                }}
              />
            ),
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
          ].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() =>
                addDigit(digit)
              }
              disabled={loading}
              style={{
                padding: 18,
                fontSize: 22,
                borderRadius: 12,
                border:
                  "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={removeDigit}
            disabled={loading}
            style={{
              padding: 18,
              fontSize: 22,
              borderRadius: 12,
              border:
                "1px solid #e5e7eb",
              background: "#f9fafb",
            }}
          >
            ←
          </button>

          <button
            type="button"
            onClick={() =>
              addDigit("0")
            }
            disabled={loading}
            style={{
              padding: 18,
              fontSize: 22,
              borderRadius: 12,
              border:
                "1px solid #e5e7eb",
              background: "#f9fafb",
            }}
          >
            0
          </button>

          <button
            type="button"
            onClick={login}
            disabled={
              loading ||
              pin.length !== 6
            }
            style={{
              padding: 18,
              borderRadius: 12,
              border: "none",
              background:
                pin.length === 6
                  ? "#111827"
                  : "#d1d5db",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {loading
              ? "..."
              : "LOGIN"}
          </button>
        </div>

        {error && (
          <p
            style={{
              color: "#dc2626",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </main>
  );
}