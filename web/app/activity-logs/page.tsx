"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  clearAuthSession,
  getAuthToken,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type Log = {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

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

function formatDate(
  value: string,
) {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

function humanizeAction(
  action: string,
) {
  return action
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

export default function ActivityLogsPage() {
  const [logs, setLogs] =
    useState<Log[]>([]);

  const [pagination, setPagination] =
    useState<Pagination | null>(null);

  const [page, setPage] =
    useState(1);

  const [search, setSearch] =
    useState("");

  /*
   * Initial page loading only.
   *
   * IMPORTANT:
   * This is NOT changed during background refresh.
   */
  const [loading, setLoading] =
    useState(true);

  /*
   * Background refresh indicator.
   *
   * This allows the existing logs to remain
   * visible while a new request is running.
   */
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  /*
   * Prevent overlapping requests.
   *
   * If a refresh is still running when the next
   * 5-second interval fires, we simply skip that
   * refresh instead of starting another request.
   */
  const requestInProgress =
    useRef(false);

  /*
   * Keep the interval tied to the latest page
   * without repeatedly recreating it.
   */
  const pageRef =
    useRef(page);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const load = useCallback(
    async (
      selectedPage = pageRef.current,
      options?: {
        initial?: boolean;
        manual?: boolean;
      },
    ) => {
      /*
       * Never start another request while one
       * is already running.
       */
      if (
        requestInProgress.current
      ) {
        return;
      }

      requestInProgress.current =
        true;

      const isInitial =
        options?.initial === true;

      const isManual =
        options?.manual === true;

      try {
        /*
         * ONLY the first request shows the
         * full-page loading state.
         *
         * Background refresh NEVER clears
         * the existing data.
         */
        if (isInitial) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError("");

        const data =
          await api<{
            success: boolean;
            logs?: Log[];
            pagination?: Pagination;
          }>(
            `/api/activity-logs?page=${selectedPage}&limit=20`,
          );

        /*
         * IMPORTANT:
         *
         * Replace the list ONLY after the new
         * response has successfully arrived.
         *
         * We NEVER set logs([]) before fetching.
         */
        setLogs(
          Array.isArray(data.logs)
            ? data.logs
            : [],
        );

        setPagination(
          data.pagination ?? null,
        );

        setLastUpdated(
          new Date(),
        );

        /*
         * A successful manual refresh should
         * also clear any previous error.
         */
        if (isManual) {
          setError("");
        }
      } catch (err) {
        /*
         * Keep the old logs visible if a
         * background refresh fails.
         *
         * This is important for a reliable
         * audit screen.
         */
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load activity logs.",
        );
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }

        requestInProgress.current =
          false;
      }
    },
    [],
  );

  /*
   * Initial load + 5-second background refresh.
   *
   * The interval does NOT call setLoading(true),
   * so the existing records never disappear.
   */
  useEffect(() => {
    if (!getAuthToken()) {
      clearAuthSession();
      window.location.replace(
        "/login",
      );

      return;
    }

    void load(1, {
      initial: true,
    });

    const interval =
      window.setInterval(() => {
        void load(
          pageRef.current,
          {
            initial: false,
          },
        );
      }, 5000);

    return () =>
      window.clearInterval(
        interval,
      );
  }, [load]);

  /*
   * Page changes.
   *
   * We intentionally do NOT show the full-page
   * loading screen here either.
   */
  useEffect(() => {
    if (page === 1) {
      return;
    }

    void load(page, {
      initial: false,
      manual: true,
    });
  }, [page, load]);

  const filtered =
    logs.filter(
      (log) => {
        const q =
          search
            .trim()
            .toLowerCase();

        if (!q) {
          return true;
        }

        return (
          log.user_name
            ?.toLowerCase()
            .includes(q) ||
          log.action
            .toLowerCase()
            .includes(q) ||
          log.entity_type
            .toLowerCase()
            .includes(q) ||
          log.entity_id
            ?.toLowerCase()
            .includes(q) ||
          JSON.stringify(
            log.details ?? {},
          )
            .toLowerCase()
            .includes(q)
        );
      },
    );

  function handleManualRefresh() {
    void load(page, {
      initial: false,
      manual: true,
    });
  }

  function handleLogout() {
    clearAuthSession();
    window.location.replace(
      "/login",
    );
  }

  return (
    <main style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <h1 style={s.title}>
              Activity Logs
            </h1>

            <p style={s.muted}>
              Audit trail of staff and
              system actions
            </p>

            <div style={s.refreshStatus}>
              {refreshing ? (
                <>
                  <span
                    style={s.refreshDot}
                  >
                    ●
                  </span>

                  Updating...
                </>
              ) : lastUpdated ? (
                <>
                  <span
                    style={s.liveDot}
                  >
                    ●
                  </span>

                  Live · Last updated{" "}
                  {lastUpdated.toLocaleTimeString(
                    "en-IN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )}
                </>
              ) : (
                "Live updates enabled"
              )}
            </div>
          </div>

          <div style={s.actions}>
            <button
              style={s.button}
              onClick={() =>
                window.location.replace(
                  "/",
                )
              }
            >
              Dashboard
            </button>

            <button
              style={s.button}
              onClick={
                handleManualRefresh
              }
              disabled={refreshing}
            >
              {refreshing
                ? "Updating..."
                : "Refresh"}
            </button>

            <button
              style={s.button}
              onClick={
                handleLogout
              }
            >
              Logout
            </button>
          </div>
        </header>

        <div style={s.toolbar}>
          <input
            style={s.search}
            placeholder="Search user, action, entity, details..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value,
              )
            }
          />

          <span
            style={s.count}
          >
            {filtered.length} shown
            {" · "}
            {pagination?.total ??
              0}{" "}
            total
          </span>
        </div>

        {error && (
          <div style={s.error}>
            <strong>
              Refresh issue:
            </strong>{" "}
            {error}

            <span
              style={
                s.errorHint
              }
            >
              Existing activity records
              are still being displayed.
            </span>
          </div>
        )}

        {loading ? (
          <div style={s.loadingBox}>
            <p style={s.muted}>
              Loading activity...
            </p>
          </div>
        ) : filtered.length ===
          0 ? (
          <div style={s.empty}>
            <strong>
              No activity logs found.
            </strong>

            <span>
              Try a different search.
            </span>
          </div>
        ) : (
          <div style={s.list}>
            {filtered.map(
              (log) => (
                <article
                  key={log.id}
                  style={s.card}
                >
                  <div
                    style={s.top}
                  >
                    <div
                      style={
                        s.actionGroup
                      }
                    >
                      <strong
                        style={
                          s.action
                        }
                      >
                        {humanizeAction(
                          log.action,
                        )}
                      </strong>

                      <span
                        style={
                          s.entityBadge
                        }
                      >
                        {log.entity_type}
                      </span>
                    </div>

                    <span
                      style={s.date}
                    >
                      {formatDate(
                        log.created_at,
                      )}
                    </span>
                  </div>

                  <div
                    style={s.meta}
                  >
                    <span>
                      <strong>
                        User:
                      </strong>{" "}
                      {log.user_name ??
                        log.user_id}
                    </span>

                    {log.entity_id && (
                      <span>
                        <strong>
                          ID:
                        </strong>{" "}
                        {log.entity_id}
                      </span>
                    )}
                  </div>

                  {log.details && (
                    <details
                      style={
                        s.detailsWrapper
                      }
                    >
                      <summary
                        style={
                          s.detailsSummary
                        }
                      >
                        View details
                      </summary>

                      <pre
                        style={
                          s.details
                        }
                      >
                        {JSON.stringify(
                          log.details,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </article>
              ),
            )}
          </div>
        )}

        {pagination &&
          pagination.totalPages >
            1 && (
            <div
              style={
                s.pagination
              }
            >
              <button
                style={
                  page <= 1
                    ? s.disabledButton
                    : s.button
                }
                disabled={
                  page <= 1 ||
                  refreshing
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      Math.max(
                        1,
                        value - 1,
                      ),
                  )
                }
              >
                Previous
              </button>

              <span>
                Page{" "}
                <strong>
                  {pagination.page}
                </strong>{" "}
                of{" "}
                <strong>
                  {
                    pagination.totalPages
                  }
                </strong>
              </span>

              <button
                style={
                  page >=
                  pagination.totalPages
                    ? s.disabledButton
                    : s.button
                }
                disabled={
                  page >=
                    pagination.totalPages ||
                  refreshing
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      value + 1,
                  )
                }
              >
                Next
              </button>
            </div>
          )}
      </div>
    </main>
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
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
  },

  muted: {
    color: "#6b7280",
  },

  refreshStatus: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
  },

  liveDot: {
    color: "#16a34a",
    marginRight: 5,
  },

  refreshDot: {
    color: "#2563eb",
    marginRight: 5,
  },

  actions: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
  },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  search: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    border:
      "1px solid #d1d5db",
    borderRadius: 8,
    outline: "none",
  },

  count: {
    flexShrink: 0,
    color: "#64748b",
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  button: {
    minHeight: 40,
    padding: "9px 12px",
    border:
      "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    whiteSpace: "nowrap",
    cursor: "pointer",
    fontWeight: 600,
  },

  disabledButton: {
    minHeight: 40,
    padding: "9px 12px",
    border:
      "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#f3f4f6",
    color: "#9ca3af",
    whiteSpace: "nowrap",
    cursor: "not-allowed",
    fontWeight: 600,
  },

  error: {
    padding: 10,
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: 8,
    marginBottom: 12,
  },

  errorHint: {
    display: "block",
    marginTop: 4,
    color: "#7f1d1d",
    fontSize: 12,
  },

  loadingBox: {
    padding: 40,
    textAlign: "center",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  card: {
    border:
      "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  },

  top: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  action: {
    fontSize: 14,
  },

  entityBadge: {
    display: "inline-block",
    padding:
      "3px 7px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 10,
    fontWeight: 700,
  },

  date: {
    color: "#64748b",
    fontSize: 11,
    flexShrink: 0,
  },

  meta: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 11,
    marginTop: 7,
  },

  detailsWrapper: {
    marginTop: 9,
    borderTop:
      "1px solid #f1f5f9",
    paddingTop: 8,
  },

  detailsSummary: {
    cursor: "pointer",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
  },

  details: {
    marginTop: 8,
    padding: 10,
    background: "#f8fafc",
    borderRadius: 7,
    overflowX: "auto",
    fontSize: 11,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },

  empty: {
    padding: 40,
    textAlign: "center",
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  pagination: {
    display: "flex",
    justifyContent:
      "center",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    flexWrap: "wrap",
  },
};