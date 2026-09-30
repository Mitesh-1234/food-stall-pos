"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  clearAuthSession,
  getAuthToken,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type Summary = {
  totalOrders: number;
  deliveredOrders: number;
  preparingOrders: number;
  readyOrders: number;
  cancelledOrders: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  cashCollection: number;
  onlineCollection: number;
};
type ApiSummaryResponse = {
  success: boolean;
  summary?: Summary;
};
function localDate() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

async function api<T>(path: string): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    clearAuthSession();
    window.location.replace("/login");
    throw new Error("Authentication required.");
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const data =
    await response.json().catch(() => null);

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    clearAuthSession();
    window.location.replace("/login");

    throw new Error(
      data?.error ??
        "Authentication required.",
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ??
        "Request failed.",
    );
  }

  return data as T;
}

function money(value: number) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function SalesPage() {
  const [summary, setSummary] =
    useState<Summary | null>(null);
  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [range, setRange] =
    useState<"today" | "all">("today");

  const [lastUpdated, setLastUpdated] =
    useState("");

  const loadReports =
    useCallback(
      async (initial = false) => {
        try {
          if (initial) {
            setLoading(true);
          } else {
            setRefreshing(true);
          }

          setError("");

          const query =
            range === "today"
              ? (() => {
                  const today =
                    localDate();

                  return `?from=${today}&to=${today}`;
                })()
              : "?all=true";

          /*
           * Sales uses the VIEW_SALES permission and therefore
           * only requests the Sales summary endpoint.
           *
           * Item-wise and add-on-wise analytics belong to the
           * Reports page and require VIEW_REPORTS.
           *
           * The backend response is { success, summary },
           * so explicitly unwrap summary here.
           */
          const summaryResponse =
            await api<ApiSummaryResponse>(
              `/api/sales/summary${query}`,
            );

          if (!summaryResponse.summary) {
            throw new Error(
              "Sales summary response did not contain summary data.",
            );
          }

          setSummary(
            summaryResponse.summary,
          );

          setLastUpdated(
            new Date().toLocaleTimeString(),
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load sales.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [range],
    );

  useEffect(() => {
    if (!getAuthToken()) {
      clearAuthSession();
      window.location.replace("/login");
      return;
    }

    void loadReports(true);
  }, [loadReports]);

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void loadReports(false);
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    return () =>
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
  }, [loadReports]);

  function logout() {
    clearAuthSession();
    window.location.replace("/login");
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              Sales
            </h1>

            <p style={styles.muted}>
              POS sales summary and payment collection
            </p>

            <div style={styles.statusRow}>
              <span style={styles.live}>
                ● Synced
              </span>

              {lastUpdated && (
                <span style={styles.lastUpdated}>
                  Last updated {lastUpdated}
                </span>
              )}
            </div>
          </div>

          <div
            className="sales-actions"
            style={styles.actions}
          >
            <button
              style={styles.secondary}
              onClick={() =>
                window.location.replace(
                  "/orders",
                )
              }
            >
              Orders
            </button>

            <button
              style={styles.secondary}
              onClick={() =>
                window.location.replace(
                  "/reports",
                )
              }
            >
              Reports
            </button>

            <button
              style={styles.primary}
              onClick={() =>
                window.location.replace(
                  "/pos",
                )
              }
            >
              + New Order
            </button>

            <button
              style={styles.secondary}
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </header>

        <div
          className="sales-range"
          style={styles.rangeRow}
        >
          <button
            style={
              range === "today"
                ? styles.rangeActive
                : styles.range
            }
            onClick={() =>
              setRange("today")
            }
          >
            Today
          </button>

          <button
            style={
              range === "all"
                ? styles.rangeActive
                : styles.range
            }
            onClick={() =>
              setRange("all")
            }
          >
            All Recorded Data
          </button>

          <button
            style={styles.refresh}
            disabled={refreshing}
            onClick={() =>
              void loadReports(false)
            }
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={styles.error}>
            <strong>Sales could not load:</strong>{" "}
            {error}
          </div>
        )}

        {loading ? (
          <div style={styles.loading}>
            Loading sales from the POS database...
          </div>
        ) : (
          <>
            {summary && (
              <>
                <section style={styles.cards}>
                  <Card
                    title="Total Orders"
                    value={
                      summary.totalOrders
                    }
                  />
                  <Card
                    title="Delivered"
                    value={
                      summary.deliveredOrders
                    }
                  />
                  <Card
                    title="Preparing"
                    value={
                      summary.preparingOrders
                    }
                  />
                  <Card
                    title="Ready"
                    value={
                      summary.readyOrders
                    }
                  />
                  <Card
                    title="Cancelled"
                    value={
                      summary.cancelledOrders
                    }
                  />
                  <Card
                    title="Gross Sales"
                    value={money(
                      summary.grossSales,
                    )}
                  />
                  <Card
                    title="Refunds"
                    value={money(
                      summary.refunds,
                    )}
                  />
                  <Card
                    title="Net Sales"
                    value={money(
                      summary.netSales,
                    )}
                  />
                </section>

                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>
                    Payment Collection
                  </h2>

                  <div
                    style={
                      styles.collectionGrid
                    }
                  >
                    <Collection
                      label="Cash Collection"
                      value={money(
                        summary.cashCollection,
                      )}
                    />

                    <Collection
                      label="Online Collection"
                      value={money(
                        summary.onlineCollection,
                      )}
                    />

                    <Collection
                      label="Net Sales"
                      value={money(
                        summary.netSales,
                      )}
                    />
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @media (min-width: 700px) {
          .sales-actions {
            width: auto;
          }
        }

        @media (max-width: 699px) {
          .sales-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-width: none;
          }
        }

        @media (max-width: 420px) {
          .sales-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .sales-range {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .sales-range button:last-child {
            grid-column: 1 / -1;
          }
        }

        @media (min-width: 700px) {
          .sales-range {
            display: flex;
          }

          .sales-range button {
            width: auto;
          }
        }
      `}</style>
    </main>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div style={styles.card}>
      <span style={styles.cardTitle}>
        {title}
      </span>

      <strong style={styles.cardValue}>
        {value}
      </strong>
    </div>
  );
}

function Collection({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={styles.collection}>
      <span style={styles.collectionLabel}>
        {label}
      </span>
      <strong style={styles.collectionValue}>
        {value}
      </strong>
    </div>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100vh",
    background: "#f5f6f8",
    padding: 16,
  },

  container: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 18,
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    fontSize: 32,
  },

  muted: {
    color: "#6b7280",
    fontSize: 13,
  },

  statusRow: {
    display: "flex",
    gap: 9,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },

  live: {
    color: "#16a34a",
    fontSize: 12,
    fontWeight: 700,
  },

  lastUpdated: {
    color: "#64748b",
    fontSize: 11,
  },

  actions: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: 7,
    width: "100%",
    maxWidth: 620,
  },

  primary: {
    padding: "9px 12px",
    border: 0,
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },

  secondary: {
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
  },

  error: {
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: 9,
    marginBottom: 12,
  },

  loading: {
    padding: 20,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    color: "#475569",
  },

  rangeRow: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 14,
  },

  range: {
    padding: "7px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 18,
    background: "#fff",
    cursor: "pointer",
  },

  rangeActive: {
    padding: "7px 12px",
    border: "1px solid #111827",
    borderRadius: 18,
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
  },

  refresh: {
    padding: "7px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    width: "100%",
  },

  cards: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(155px,1fr))",
    gap: 9,
    marginBottom: 14,
  },

  card: {
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 11,
  },

  cardTitle: {
    display: "block",
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 5,
  },

  cardValue: {
    fontSize: 19,
  },

  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 19,
  },

  collectionGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(180px,1fr))",
    gap: 7,
  },

  collection: {
    padding: 12,
    borderRadius: 9,
    background: "#f5f6f8",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  collectionLabel: {
    color: "#64748b",
    fontSize: 12,
  },

  collectionValue: {
    fontSize: 18,
  },

  reportList: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  reportCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    padding: 10,
  },

  reportTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },

  reportDetails: {
    display: "flex",
    gap: 12,
    marginTop: 5,
    color: "#6b7280",
    fontSize: 11,
    flexWrap: "wrap",
  },
};
