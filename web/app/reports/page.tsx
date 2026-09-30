"use client";

import {
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

type Item = {
  itemId?: string;
  itemName: string;
  quantitySold: number;
  itemRevenue: number;
  quantityCancelled: number;
  cancelledValue: number;
};

type Addon = {
  addonId?: string;
  addonName: string;
  quantitySelected: number;
  addonRevenue: number;
  quantityCancelled: number;
  cancelledValue: number;
};

type Range =
  | "TODAY"
  | "YESTERDAY"
  | "EVENT"
  | "CUSTOM";

type SummaryResponse = {
  success: boolean;
  summary?: Summary;
};

type ItemsResponse = {
  success: boolean;
  items?: Item[];
};

type AddonsResponse = {
  success: boolean;
  addons?: Addon[];
};

function dateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function today() {
  return dateValue(new Date());
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateValue(d);
}

function money(value: number) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

async function api<T>(
  path: string,
): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    clearAuthSession();
    window.location.replace("/login");
    throw new Error(
      "Authentication required.",
    );
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

export default function ReportsPage() {
  const [range, setRange] =
    useState<Range>("TODAY");

  const [from, setFrom] =
    useState(today());

  const [to, setTo] =
    useState(today());

  const [summary, setSummary] =
    useState<Summary | null>(null);

  const [items, setItems] =
    useState<Item[]>([]);

  const [addons, setAddons] =
    useState<Addon[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState("");

  async function load(
    initial = false,
  ) {
    try {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      let query = "";

      if (range === "TODAY") {
        const value = today();
        query =
          `?from=${value}&to=${value}`;
      } else if (
        range === "YESTERDAY"
      ) {
        const value =
          yesterday();

        query =
          `?from=${value}&to=${value}`;
      } else if (
        range === "EVENT"
      ) {
        /*
         * The current database has no separate event entity.
         * Therefore "This Event" means all recorded POS data.
         */
        query = "?all=true";
      } else {
        if (!from || !to) {
          throw new Error(
            "Select both From and To dates.",
          );
        }

        if (from > to) {
          throw new Error(
            "From date cannot be after To date.",
          );
        }

        query =
          `?from=${from}&to=${to}`;
      }

      const [
        summaryResponse,
        itemResponse,
        addonResponse,
      ] = await Promise.all([
        api<SummaryResponse>(
          `/api/sales/summary${query}`,
        ),
        api<ItemsResponse>(
          `/api/sales/item-wise${query}`,
        ),
        api<AddonsResponse>(
          `/api/sales/addon-wise${query}`,
        ),
      ]);

      if (!summaryResponse.summary) {
        throw new Error(
          "Report summary response did not contain summary data.",
        );
      }

      setSummary(
        summaryResponse.summary,
      );

      setItems(
        itemResponse.items ?? [],
      );

      setAddons(
        addonResponse.addons ?? [],
      );

      setLastUpdated(
        new Date().toLocaleTimeString(),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load reports.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!getAuthToken()) {
      clearAuthSession();
      window.location.replace("/login");
      return;
    }

    void load(true);
    // Only range changes automatically reload.
    // Custom dates reload through Apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void load(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  function logout() {
    clearAuthSession();
    window.location.replace("/login");
  }

  return (
    <main style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <h1 style={s.title}>
              Reports
            </h1>

            <p style={s.muted}>
              Detailed sales and product analytics
            </p>

            <div style={s.statusRow}>
              <span style={s.live}>
                ● Synced
              </span>

              {lastUpdated && (
                <span style={s.lastUpdated}>
                  Last updated {lastUpdated}
                </span>
              )}
            </div>
          </div>

          <div style={s.actions}>
            <button
              style={s.button}
              onClick={() =>
                window.location.replace(
                  "/sales",
                )
              }
            >
              Sales
            </button>

            <button
              style={s.button}
              onClick={() =>
                window.location.replace(
                  "/orders",
                )
              }
            >
              Orders
            </button>

            <button
              style={s.primary}
              disabled={refreshing}
              onClick={() =>
                void load(false)
              }
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>

            <button
              style={s.button}
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </header>

        <div style={s.tabs}>
          {[
            ["TODAY", "Today"],
            ["YESTERDAY", "Yesterday"],
            ["EVENT", "This Event"],
            ["CUSTOM", "Custom Date"],
          ].map(([value, label]) => (
            <button
              key={value}
              style={
                range === value
                  ? s.activeTab
                  : s.tab
              }
              onClick={() =>
                setRange(
                  value as Range,
                )
              }
            >
              {label}
            </button>
          ))}
        </div>

        {range === "CUSTOM" && (
          <div style={s.custom}>
            <label style={s.field}>
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(e) =>
                  setFrom(
                    e.target.value,
                  )
                }
              />
            </label>

            <label style={s.field}>
              <span>To</span>
              <input
                type="date"
                value={to}
                onChange={(e) =>
                  setTo(
                    e.target.value,
                  )
                }
              />
            </label>

            <button
              style={s.primary}
              onClick={() =>
                void load(false)
              }
            >
              Apply
            </button>
          </div>
        )}

        {error && (
          <div style={s.error}>
            <strong>
              Report could not load:
            </strong>{" "}
            {error}
          </div>
        )}

        {loading ? (
          <div style={s.loading}>
            Loading report from the POS database...
          </div>
        ) : (
          <>
            {summary && (
              <section style={s.cards}>
                <Metric
                  title="Total Orders"
                  value={
                    summary.totalOrders
                  }
                />
                <Metric
                  title="Delivered"
                  value={
                    summary.deliveredOrders
                  }
                />
                <Metric
                  title="Preparing"
                  value={
                    summary.preparingOrders
                  }
                />
                <Metric
                  title="Ready"
                  value={
                    summary.readyOrders
                  }
                />
                <Metric
                  title="Cancelled"
                  value={
                    summary.cancelledOrders
                  }
                />
                <Metric
                  title="Gross Sales"
                  value={money(
                    summary.grossSales,
                  )}
                />
                <Metric
                  title="Refunds"
                  value={money(
                    summary.refunds,
                  )}
                />
                <Metric
                  title="Net Sales"
                  value={money(
                    summary.netSales,
                  )}
                />
                <Metric
                  title="Cash Collection"
                  value={money(
                    summary.cashCollection,
                  )}
                />
                <Metric
                  title="Online Collection"
                  value={money(
                    summary.onlineCollection,
                  )}
                />
              </section>
            )}

            <section style={s.section}>
              <div style={s.sectionHeader}>
                <h2>
                  Item-wise Performance
                </h2>

                <span style={s.muted}>
                  {items.length} item types
                </span>
              </div>

              {items.length === 0 ? (
                <p style={s.muted}>
                  No item data for this period.
                </p>
              ) : (
                <div style={s.table}>
                  <div
                    style={s.tableHeader}
                  >
                    <span>Item</span>
                    <span>Qty Sold</span>
                    <span>Revenue</span>
                    <span>Cancelled</span>
                    <span>Cancelled Value</span>
                  </div>

                  {items.map(
                    (item, index) => (
                      <div
                        key={
                          item.itemId ??
                          `${item.itemName}-${index}`
                        }
                        style={s.tableRow}
                      >
                        <strong>
                          {
                            item.itemName
                          }
                        </strong>

                        <span>
                          {
                            item.quantitySold
                          }
                        </span>

                        <span>
                          {money(
                            item.itemRevenue,
                          )}
                        </span>

                        <span>
                          {
                            item.quantityCancelled
                          }
                        </span>

                        <span>
                          {money(
                            item.cancelledValue,
                          )}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>

            <section style={s.section}>
              <div style={s.sectionHeader}>
                <h2>
                  Add-on Performance
                </h2>

                <span style={s.muted}>
                  {addons.length} add-on types
                </span>
              </div>

              {addons.length === 0 ? (
                <p style={s.muted}>
                  No add-on data for this period.
                </p>
              ) : (
                <div style={s.table}>
                  <div
                    style={s.tableHeader}
                  >
                    <span>Add-on</span>
                    <span>Selected</span>
                    <span>Revenue</span>
                    <span>Cancelled</span>
                    <span>Cancelled Value</span>
                  </div>

                  {addons.map(
                    (addon, index) => (
                      <div
                        key={
                          addon.addonId ??
                          `${addon.addonName}-${index}`
                        }
                        style={s.tableRow}
                      >
                        <strong>
                          {
                            addon.addonName
                          }
                        </strong>

                        <span>
                          {
                            addon.quantitySelected
                          }
                        </span>

                        <span>
                          {money(
                            addon.addonRevenue,
                          )}
                        </span>

                        <span>
                          {
                            addon.quantityCancelled
                          }
                        </span>

                        <span>
                          {money(
                            addon.cancelledValue,
                          )}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div style={s.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<
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
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8,
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
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
  },

  button: {
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
  },

  primary: {
    padding: "9px 12px",
    border: 0,
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
  },

  tabs: {
    display: "flex",
    gap: 6,
    margin: "20px 0 12px",
    flexWrap: "wrap",
  },

  tab: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 18,
    background: "#fff",
    cursor: "pointer",
  },

  activeTab: {
    padding: "8px 12px",
    border: "1px solid #111827",
    borderRadius: 18,
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
  },

  custom: {
    display: "flex",
    gap: 8,
    alignItems: "end",
    flexWrap: "wrap",
    marginBottom: 12,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: 12,
    color: "#475569",
  },

  error: {
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: 8,
    marginBottom: 12,
  },

  loading: {
    padding: 20,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    color: "#475569",
  },

  cards: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(150px,1fr))",
    gap: 8,
    marginBottom: 14,
  },

  metric: {
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },

  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    overflowX: "auto",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  table: {
    minWidth: 760,
  },

  tableHeader: {
    display: "grid",
    gridTemplateColumns:
      "minmax(180px,1.6fr) repeat(4,minmax(120px,1fr))",
    gap: 10,
    padding: "9px 10px",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },

  tableRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(180px,1.6fr) repeat(4,minmax(120px,1fr))",
    gap: 10,
    padding: "11px 10px",
    borderBottom:
      "1px solid #f1f5f9",
    fontSize: 13,
    alignItems: "center",
  },
};
