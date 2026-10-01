"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setAuthSession } from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Refs so keyboard handler sees latest values without re-registering
  const pinRef = useRef("");
  const loadingRef = useRef(false);
  useEffect(() => { pinRef.current = pin; }, [pin]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const loginWithPin = useCallback(async (currentPin: string) => {
    if (currentPin.length !== 6 || loadingRef.current) {
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
            pin: currentPin,
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
       * Skip /session-start - session is already stored from login.
       * Go directly to /orders to save one full round-trip.
       */
      window.location.replace("/orders");
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
  }, []);

  function addDigit(digit: string) {
    if (loadingRef.current || pinRef.current.length >= 6) {
      return;
    }

    const next = pinRef.current + digit;
    pinRef.current = next;
    setPin(next);

    // Auto-submit on 6th digit - no need to tap LOGIN
    if (next.length === 6) {
      loginWithPin(next);
    }
  }

  function removeDigit() {
    if (loadingRef.current) {
      return;
    }

    setPin((current) =>
      current.slice(0, -1),
    );
  }

  // Physical keyboard support
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      else if (e.key === "Backspace") removeDigit();
      else if (e.key === "Enter") loginWithPin(pinRef.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginWithPin]);

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
            ⌫
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
            onClick={() => loginWithPin(pin)}
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
