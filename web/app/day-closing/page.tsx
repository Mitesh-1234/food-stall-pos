"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearAuthSession,
  getAuthToken,
  getPermissions,
  getUserName,
} from "../../lib/auth-storage";

type Summary = {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  cashCollection: number;
  onlineCollection: number;
  cashAfterChange: number;
  cashRefunds: number;
  expectedCash: number;
};

type SummaryResponse = {
  success: boolean;
  alreadyClosed?: boolean;
  closing?: unknown;
  summary: Summary;
};

function money(value: number) {
  return `₹${value.toFixed(2)}`;
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  const local = new Date(
    now.getTime() - offset * 60 * 1000,
  );

  return local.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  if (!value) return "-";

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fa",
    padding: "16px",
    color: "#111827",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: "border-box" as const,
  },

  app: {
    maxWidth: "1250px",
    margin: "0 auto",
  },

  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    background: "#ffffff",
    padding: "18px 20px",
    borderRadius: "16px",
    marginBottom: "16px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.05)",
  },

  topTitle: {
    margin: 0,
    fontSize: "24px",
    fontWeight: 700,
    color: "#111827",
  },

  topSubtitle: {
    display: "block",
    marginTop: "4px",
    color: "#6b7280",
    fontSize: "13px",
  },

  topActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
  },

  topButton: {
    border: 0,
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: "9px",
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "14px",
    fontWeight: 600,
  },

  header: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 800,
    color: "#111827",
  },

  subtitle: {
    margin: "6px 0 0",
    color: "#6b7280",
    fontSize: "14px",
  },

  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "18px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
    marginBottom: "16px",
  },

  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "18px",
    fontWeight: 700,
    color: "#111827",
  },

  dateRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap" as const,
  },

  label: {
    display: "block",
    marginBottom: "7px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#374151",
  },

  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "12px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
    outline: "none",
  },

  dateInput: {
    padding: "11px 12px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
  },

  refreshButton: {
    border: 0,
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: "10px",
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "14px",
    fontWeight: 700,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },

  statCard: {
    background: "#ffffff",
    borderRadius: "14px",
    padding: "16px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
    border:
      "1px solid #e5e7eb",
  },

  statLabel: {
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: 600,
  },

  statValue: {
    marginTop: "7px",
    fontSize: "24px",
    fontWeight: 800,
    color: "#111827",
  },

  twoColumn: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "16px",
  },

  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
    borderBottom:
      "1px solid #f1f5f9",
  },

  rowLast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
  },

  rowLabel: {
    color: "#6b7280",
    fontSize: "14px",
  },

  rowValue: {
    color: "#111827",
    fontSize: "14px",
    fontWeight: 700,
  },

  cashSection: {
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
    marginBottom: "16px",
    overflow: "hidden",
    border:
      "1px solid #dbeafe",
  },

  cashHeader: {
    background: "#eff6ff",
    padding: "18px",
    borderBottom:
      "1px solid #dbeafe",
  },

  cashGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "16px",
    padding: "18px",
  },

  cashBox: {
    borderRadius: "14px",
    padding: "18px",
    background: "#f8fafc",
    border:
      "1px solid #e5e7eb",
  },

  cashBoxBlue: {
    borderRadius: "14px",
    padding: "18px",
    background: "#eff6ff",
    border:
      "1px solid #bfdbfe",
  },

  cashBoxTitle: {
    fontSize: "12px",
    textTransform:
      "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 800,
    color: "#64748b",
  },

  cashAmount: {
    marginTop: "8px",
    fontSize: "26px",
    fontWeight: 800,
    color: "#111827",
  },

  cashDescription: {
    marginTop: "7px",
    fontSize: "12px",
    lineHeight: 1.5,
    color: "#64748b",
  },

  differenceMatched: {
    borderRadius: "14px",
    padding: "18px",
    background: "#ecfdf5",
    border:
      "1px solid #a7f3d0",
    color: "#047857",
  },

  differenceShort: {
    borderRadius: "14px",
    padding: "18px",
    background: "#fef2f2",
    border:
      "1px solid #fecaca",
    color: "#b91c1c",
  },

  differenceSurplus: {
    borderRadius: "14px",
    padding: "18px",
    background: "#eff6ff",
    border:
      "1px solid #bfdbfe",
    color: "#1d4ed8",
  },

  actionArea: {
    padding: "18px",
    borderTop:
      "1px solid #f1f5f9",
  },

  closeButton: {
    border: 0,
    cursor: "pointer",
    padding: "13px 20px",
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
  },

  disabledButton: {
    border: 0,
    cursor: "not-allowed",
    padding: "13px 20px",
    borderRadius: "10px",
    background: "#cbd5e1",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
  },

  alert: {
    borderRadius: "12px",
    padding: "13px 15px",
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: 600,
  },

  error: {
    background: "#fef2f2",
    color: "#b91c1c",
    border:
      "1px solid #fecaca",
  },

  success: {
    background: "#ecfdf5",
    color: "#047857",
    border:
      "1px solid #a7f3d0",
  },

  checklistGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "10px",
  },

  checklist: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px",
    background: "#f8fafc",
    borderRadius: "10px",
  },

  checkIcon: {
    width: "30px",
    height: "30px",
    minWidth: "30px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#dcfce7",
    color: "#15803d",
    fontWeight: 800,
  },

  loading: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "40px",
    textAlign: "center" as const,
    color: "#64748b",
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
  },

  accessDenied: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "40px",
    textAlign: "center" as const,
    boxShadow:
      "0 2px 10px rgba(0,0,0,0.04)",
  },

  mobileTopbar: {
    flexDirection:
      "column" as const,
    alignItems: "stretch",
  },

  mobileStats: {
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
  },

  mobileTwoColumn: {
    gridTemplateColumns: "1fr",
  },

  mobileCashGrid: {
    gridTemplateColumns: "1fr",
  },

  mobileChecklist: {
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
  },
};

export default function DayClosingPage() {
  const [selectedDate, setSelectedDate] =
    useState(todayString());

  const [summary, setSummary] =
    useState<Summary | null>(null);

  const [actualCash, setActualCash] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [closing, setClosing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [alreadyClosed, setAlreadyClosed] =
    useState(false);

  const [isMobile, setIsMobile] =
    useState(false);

  /*
   * IMPORTANT:
   * These values must NOT be read during the
   * server render because auth-storage uses
   * browser sessionStorage.
   */
  const [hydrated, setHydrated] =
    useState(false);

  const [permissions, setPermissions] =
    useState<string[]>([]);

  const [userName, setUserName] =
    useState("");

  const apiBase =
    process.env
      .NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:4000";

  /*
   * Browser-only initialization.
   *
   * This prevents the server HTML and browser
   * HTML from being different.
   */
  useEffect(() => {
    setPermissions(
      getPermissions(),
    );

    setUserName(
      getUserName(),
    );

    setHydrated(true);
  }, []);

  const hasPermission =
    hydrated &&
    permissions.includes(
      "DAY_CLOSING",
    );

  /*
   * Responsive handling.
   */
  useEffect(() => {
    const mediaQuery =
      window.matchMedia(
        "(max-width: 700px)",
      );

    const updateMobile = () => {
      setIsMobile(
        mediaQuery.matches,
      );
    };

    updateMobile();

    mediaQuery.addEventListener(
      "change",
      updateMobile,
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        updateMobile,
      );
    };
  }, []);

  /*
   * Authenticated API helper.
   */
  const authFetch =
    useCallback(
      async (
        url: string,
        options: RequestInit = {},
      ) => {
        const token =
          getAuthToken();

        if (!token) {
          window.location.href =
            "/login";

          throw new Error(
            "SESSION_EXPIRED",
          );
        }

        const response =
          await fetch(url, {
            ...options,
            headers: {
              "Content-Type":
                "application/json",
              ...(options.headers || {}),
              Authorization:
                `Bearer ${token}`,
            },
            cache: "no-store",
          });

        if (
          response.status === 401
        ) {
          clearAuthSession();

          window.location.href =
            "/login";

          throw new Error(
            "SESSION_EXPIRED",
          );
        }

        return response;
      },
      [],
    );

  /*
   * Load Day Closing summary.
   */
  const loadSummary =
    useCallback(
      async () => {
        if (!hydrated) {
          return;
        }

        if (!hasPermission) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");
        setSuccess("");

        try {
          const response =
            await authFetch(
              `${apiBase}/api/day-closing/summary?date=${encodeURIComponent(
                selectedDate,
              )}`,
            );

          const data =
            (await response.json()) as SummaryResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.summary
                ? "Failed to load day closing summary"
                : "Failed to load day closing summary",
            );
          }

          setSummary(
            data.summary,
          );

          /*
           * IMPORTANT:
           * The backend tells us whether this
           * date has already been closed.
           */
          setAlreadyClosed(
            Boolean(
              data.alreadyClosed,
            ),
          );
        } catch (err) {
          if (
            err instanceof Error &&
            err.message ===
              "SESSION_EXPIRED"
          ) {
            return;
          }

          setSummary(null);

          setAlreadyClosed(false);

          setError(
            err instanceof Error
              ? err.message
              : "Failed to load day closing summary",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        apiBase,
        authFetch,
        hasPermission,
        hydrated,
        selectedDate,
      ],
    );

  /*
   * Only load after browser hydration.
   */
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void loadSummary();
  }, [
    hydrated,
    loadSummary,
  ]);

  const actualCashNumber =
    Number(actualCash || 0);

  const difference =
    useMemo(() => {
      if (
        !summary ||
        actualCash === ""
      ) {
        return 0;
      }

      return (
        actualCashNumber -
        summary.expectedCash
      );
    }, [
      summary,
      actualCash,
      actualCashNumber,
    ]);

  function getDifferenceStyle() {
    if (
      actualCash === "" ||
      difference === 0
    ) {
      return styles.differenceMatched;
    }

    if (difference < 0) {
      return styles.differenceShort;
    }

    return styles.differenceSurplus;
  }

  function getDifferenceLabel() {
    if (actualCash === "") {
      return "Awaiting cash count";
    }

    if (difference < 0) {
      return "Cash Shortage";
    }

    if (difference > 0) {
      return "Cash Surplus";
    }

    return "Cash Matched";
  }

  async function handleCloseDay() {
    if (!summary) {
      return;
    }

    if (alreadyClosed) {
      setError(
        "This day is already closed.",
      );

      return;
    }

    const amount =
      Number(actualCash);

    if (
      actualCash.trim() === "" ||
      Number.isNaN(amount) ||
      amount < 0
    ) {
      setError(
        "Enter a valid non-negative actual cash amount.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Close ${displayDate(
          selectedDate,
        )}?\n\nExpected Cash: ${money(
          summary.expectedCash,
        )}\nActual Cash: ${money(
          amount,
        )}\nDifference: ${money(
          amount -
            summary.expectedCash,
        )}\n\nThis action cannot be reversed.`,
      );

    if (!confirmed) {
      return;
    }

    setClosing(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await authFetch(
          `${apiBase}/api/day-closing`,
          {
            method: "POST",
            body: JSON.stringify({
              closingDate:
                selectedDate,
              actualCash:
                amount,
            }),
          },
        );

      const data =
        await response.json();

      /*
       * Another device/user may have closed
       * the same date first.
       */
      if (
        response.status === 409
      ) {
        setAlreadyClosed(true);

        setError(
          data.error ||
            "Day is already closed.",
        );

        return;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Failed to close day",
        );
      }

      setSuccess(
        `Day closing completed successfully for ${displayDate(
          selectedDate,
        )}.`,
      );

      setAlreadyClosed(true);

      /*
       * Keep the entered amount visible after
       * successful closing.
       */
      setActualCash(
        String(amount),
      );

      /*
       * Reload the server state so the UI is
       * based on the database, not only local state.
       */
      await loadSummary();
    } catch (err) {
      if (
        err instanceof Error &&
        err.message ===
          "SESSION_EXPIRED"
      ) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Failed to close day",
      );
    } finally {
      setClosing(false);
    }
  }

  /*
   * Prevent hydration mismatch.
   *
   * The server cannot access sessionStorage.
   * Render a stable loading tree until the
   * browser has initialized authentication.
   */
  if (!hydrated) {
    return (
      <main style={styles.page}>
        <div style={styles.app}>
          <div
            style={styles.loading}
          >
            Loading Day Closing...
          </div>
        </div>
      </main>
    );
  }

  if (!hasPermission) {
    return (
      <main style={styles.page}>
        <div style={styles.app}>
          <div
            style={
              styles.accessDenied
            }
          >
            <h2>
              Access Restricted
            </h2>

            <p
              style={{
                color: "#6b7280",
              }}
            >
              You do not have permission
              to perform day closing.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.app}>
        <nav
          style={{
            ...styles.topbar,
            ...(isMobile
              ? styles.mobileTopbar
              : {}),
          }}
        >
          <div>
            <h1
              style={
                styles.topTitle
              }
            >
              Food Stall POS
            </h1>

            <span
              style={
                styles.topSubtitle
              }
            >
              Day Closing
            </span>
          </div>

          <div
            style={
              styles.topActions
            }
          >
            <button
              type="button"
              style={
                styles.topButton
              }
              onClick={() =>
                window.location.href =
                  "/orders"
              }
            >
              Orders
            </button>

            <button
              type="button"
              style={
                styles.topButton
              }
              onClick={() =>
                window.location.href =
                  "/"
              }
            >
              Dashboard
            </button>
          </div>
        </nav>

        <header
          style={styles.header}
        >
          <h1
            style={styles.title}
          >
            Day Closing
          </h1>

          <p
            style={styles.subtitle}
          >
            Reconcile the expected
            cash with the physical
            cash counted.
          </p>

          <p
            style={{
              ...styles.subtitle,
              marginTop: "8px",
            }}
          >
            Logged in as{" "}
            <strong>
              {userName || "Staff"}
            </strong>
          </p>
        </header>

        {error && (
          <div
            style={{
              ...styles.alert,
              ...styles.error,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div
            style={{
              ...styles.alert,
              ...styles.success,
            }}
          >
            ✓ {success}
          </div>
        )}

        <section
          style={styles.card}
        >
          <div
            style={styles.dateRow}
          >
            <div>
              <label
                htmlFor="closingDate"
                style={styles.label}
              >
                Closing Date
              </label>

              <input
                id="closingDate"
                type="date"
                value={selectedDate}
                disabled={closing}
                onChange={(event) => {
                  setSelectedDate(
                    event.target.value,
                  );

                  setActualCash("");

                  setError("");

                  setSuccess("");

                  setSummary(null);

                  setAlreadyClosed(false);
                }}
                style={
                  styles.dateInput
                }
              />
            </div>

            <button
              type="button"
              style={
                styles.refreshButton
              }
              disabled={
                loading || closing
              }
              onClick={() => {
                void loadSummary();
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </section>

        {loading ? (
          <div
            style={styles.loading}
          >
            Loading day closing
            summary...
          </div>
        ) : !summary ? (
          <div
            style={styles.loading}
          >
            No closing data available
          </div>
        ) : (
          <>
            {alreadyClosed && (
              <div
                style={{
                  ...styles.alert,
                  ...styles.success,
                }}
              >
                ✓ This day has already
                been closed. The closing
                record is locked.
              </div>
            )}

            <section
              style={{
                ...styles.statsGrid,
                ...(isMobile
                  ? styles.mobileStats
                  : {}),
              }}
            >
              <div
                style={
                  styles.statCard
                }
              >
                <div
                  style={
                    styles.statLabel
                  }
                >
                  Total Orders
                </div>

                <div
                  style={
                    styles.statValue
                  }
                >
                  {summary.totalOrders}
                </div>
              </div>

              <div
                style={
                  styles.statCard
                }
              >
                <div
                  style={
                    styles.statLabel
                  }
                >
                  Delivered
                </div>

                <div
                  style={{
                    ...styles.statValue,
                    color: "#16a34a",
                  }}
                >
                  {
                    summary.deliveredOrders
                  }
                </div>
              </div>

              <div
                style={
                  styles.statCard
                }
              >
                <div
                  style={
                    styles.statLabel
                  }
                >
                  Cancelled
                </div>

                <div
                  style={{
                    ...styles.statValue,
                    color: "#d97706",
                  }}
                >
                  {
                    summary.cancelledOrders
                  }
                </div>
              </div>

              <div
                style={
                  styles.statCard
                }
              >
                <div
                  style={
                    styles.statLabel
                  }
                >
                  Net Sales
                </div>

                <div
                  style={{
                    ...styles.statValue,
                    color: "#2563eb",
                    fontSize: "21px",
                  }}
                >
                  {money(
                    summary.netSales,
                  )}
                </div>
              </div>
            </section>

            <div
              style={{
                ...styles.twoColumn,
                ...(isMobile
                  ? styles.mobileTwoColumn
                  : {}),
              }}
            >
              <section
                style={styles.card}
              >
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Sales Summary
                </h2>

                <div
                  style={
                    styles.row
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Gross Sales
                  </span>

                  <strong
                    style={
                      styles.rowValue
                    }
                  >
                    {money(
                      summary.grossSales,
                    )}
                  </strong>
                </div>

                <div
                  style={
                    styles.row
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Refunds
                  </span>

                  <strong
                    style={{
                      ...styles.rowValue,
                      color: "#dc2626",
                    }}
                  >
                    -{" "}
                    {money(
                      summary.refunds,
                    )}
                  </strong>
                </div>

                <div
                  style={
                    styles.rowLast
                  }
                >
                  <span
                    style={{
                      ...styles.rowLabel,
                      fontWeight: 700,
                    }}
                  >
                    Net Sales
                  </span>

                  <strong
                    style={{
                      ...styles.rowValue,
                      fontSize: "16px",
                    }}
                  >
                    {money(
                      summary.netSales,
                    )}
                  </strong>
                </div>
              </section>

              <section
                style={styles.card}
              >
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Payment Collection
                </h2>

                <div
                  style={
                    styles.row
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Cash Collection
                  </span>

                  <strong
                    style={
                      styles.rowValue
                    }
                  >
                    {money(
                      summary.cashCollection,
                    )}
                  </strong>
                </div>

                <div
                  style={
                    styles.row
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Online Collection
                  </span>

                  <strong
                    style={
                      styles.rowValue
                    }
                  >
                    {money(
                      summary.onlineCollection,
                    )}
                  </strong>
                </div>

                <div
                  style={
                    styles.row
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Cash After Change
                  </span>

                  <strong
                    style={
                      styles.rowValue
                    }
                  >
                    {money(
                      summary.cashAfterChange,
                    )}
                  </strong>
                </div>

                <div
                  style={
                    styles.rowLast
                  }
                >
                  <span
                    style={
                      styles.rowLabel
                    }
                  >
                    Cash Refunds
                  </span>

                  <strong
                    style={{
                      ...styles.rowValue,
                      color: "#dc2626",
                    }}
                  >
                    -{" "}
                    {money(
                      summary.cashRefunds,
                    )}
                  </strong>
                </div>
              </section>
            </div>

            <section
              style={
                styles.cashSection
              }
            >
              <div
                style={
                  styles.cashHeader
                }
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "19px",
                    fontWeight: 800,
                    color: "#111827",
                  }}
                >
                  Cash Reconciliation
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  Count the physical
                  cash in the drawer
                  and enter the amount.
                </p>
              </div>

              <div
                style={{
                  ...styles.cashGrid,
                  ...(isMobile
                    ? styles.mobileCashGrid
                    : {}),
                }}
              >
                <div
                  style={
                    styles.cashBox
                  }
                >
                  <div
                    style={
                      styles.cashBoxTitle
                    }
                  >
                    Expected Cash
                  </div>

                  <div
                    style={
                      styles.cashAmount
                    }
                  >
                    {money(
                      summary.expectedCash,
                    )}
                  </div>

                  <div
                    style={
                      styles.cashDescription
                    }
                  >
                    Cash after change
                    minus cash refunds.
                  </div>
                </div>

                <div
                  style={
                    styles.cashBoxBlue
                  }
                >
                  <label
                    htmlFor="actualCash"
                    style={{
                      ...styles.cashBoxTitle,
                      color: "#2563eb",
                    }}
                  >
                    Actual Cash Counted
                  </label>

                  <div
                    style={{
                      position:
                        "relative",
                      marginTop: "8px",
                    }}
                  >
                    <span
                      style={{
                        position:
                          "absolute",
                        left: "12px",
                        top: "50%",
                        transform:
                          "translateY(-50%)",
                        fontWeight: 800,
                        color: "#64748b",
                      }}
                    >
                      ₹
                    </span>

                    <input
                      id="actualCash"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={actualCash}
                      disabled={
                        alreadyClosed ||
                        closing
                      }
                      onChange={(event) => {
                        setActualCash(
                          event.target.value,
                        );

                        setError("");

                        setSuccess("");
                      }}
                      placeholder="0.00"
                      style={{
                        ...styles.input,
                        paddingLeft:
                          "32px",
                        fontSize:
                          "20px",
                        fontWeight: 800,
                      }}
                    />
                  </div>
                </div>

                <div
                  style={
                    getDifferenceStyle()
                  }
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 800,
                      textTransform:
                        "uppercase",
                    }}
                  >
                    {getDifferenceLabel()}
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "26px",
                      fontWeight: 800,
                    }}
                  >
                    {actualCash === ""
                      ? "—"
                      : money(
                          Math.abs(
                            difference,
                          ),
                        )}
                  </div>

                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "12px",
                    }}
                  >
                    {actualCash === ""
                      ? "Enter physical cash to calculate."
                      : difference === 0
                        ? "Physical cash exactly matches expected."
                        : difference < 0
                          ? "Physical cash is below expected."
                          : "Physical cash is above expected."}
                  </div>
                </div>
              </div>

              <div
                style={
                  styles.actionArea
                }
              >
                {alreadyClosed ? (
                  <div
                    style={{
                      ...styles.alert,
                      ...styles.success,
                      marginBottom: 0,
                    }}
                  >
                    ✓ This day has
                    already been closed.
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      closing ||
                      actualCash.trim() ===
                        ""
                    }
                    style={
                      closing ||
                      actualCash.trim() ===
                        ""
                        ? styles.disabledButton
                        : styles.closeButton
                    }
                    onClick={
                      handleCloseDay
                    }
                  >
                    {closing
                      ? "Closing Day..."
                      : "✓ Close Day"}
                  </button>
                )}
              </div>
            </section>

            <section
              style={styles.card}
            >
              <h2
                style={
                  styles.sectionTitle
                }
              >
                Closing Checklist
              </h2>

              <div
                style={{
                  ...styles.checklistGrid,
                  ...(isMobile
                    ? styles.mobileChecklist
                    : {}),
                }}
              >
                <div
                  style={
                    styles.checklist
                  }
                >
                  <span
                    style={
                      styles.checkIcon
                    }
                  >
                    ✓
                  </span>

                  <div>
                    <strong
                      style={{
                        fontSize:
                          "13px",
                      }}
                    >
                      Sales calculated
                    </strong>

                    <div
                      style={{
                        color:
                          "#64748b",
                        fontSize:
                          "11px",
                        marginTop:
                          "2px",
                      }}
                    >
                      {displayDate(
                        selectedDate,
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={
                    styles.checklist
                  }
                >
                  <span
                    style={
                      styles.checkIcon
                    }
                  >
                    ✓
                  </span>

                  <div>
                    <strong
                      style={{
                        fontSize:
                          "13px",
                      }}
                    >
                      Refunds included
                    </strong>

                    <div
                      style={{
                        color:
                          "#64748b",
                        fontSize:
                          "11px",
                        marginTop:
                          "2px",
                      }}
                    >
                      Cash refunds deducted
                    </div>
                  </div>
                </div>

                <div
                  style={
                    styles.checklist
                  }
                >
                  <span
                    style={
                      styles.checkIcon
                    }
                  >
                    ✓
                  </span>

                  <div>
                    <strong
                      style={{
                        fontSize:
                          "13px",
                      }}
                    >
                      Expected cash
                    </strong>

                    <div
                      style={{
                        color:
                          "#64748b",
                        fontSize:
                          "11px",
                        marginTop:
                          "2px",
                      }}
                    >
                      {money(
                        summary.expectedCash,
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={
                    styles.checklist
                  }
                >
                  <span
                    style={
                      styles.checkIcon
                    }
                  >
                    ₹
                  </span>

                  <div>
                    <strong
                      style={{
                        fontSize:
                          "13px",
                      }}
                    >
                      Cash count
                    </strong>

                    <div
                      style={{
                        color:
                          "#64748b",
                        fontSize:
                          "11px",
                        marginTop:
                          "2px",
                      }}
                    >
                      Physical drawer total
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}