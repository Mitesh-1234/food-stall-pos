"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getAuthToken,
  getUserName,
  getPermissions,
  clearAuthSession,
} from "../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

type MenuItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
};

const menuItems: MenuItem[] = [
  {
    href: "/pos",
    label: "New Order",
    icon: "＋",
    permission: "CREATE_ORDER",
  },
  {
    href: "/orders",
    label: "Orders",
    icon: "🧾",
    permission: "VIEW_ORDERS",
  },
  {
    href: "/menu",
    label: "Menu",
    icon: "🍽️",
    permission: "MANAGE_ITEMS",
  },
  {
    href: "/sales",
    label: "Sales",
    icon: "💰",
    permission: "VIEW_SALES",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "📊",
    permission: "VIEW_REPORTS",
  },
  {
    href: "/day-closing",
    label: "Day Closing",
    icon: "🔒",
    permission: "DAY_CLOSING",
  },
  {
    href: "/activity-logs",
    label: "Activity Logs",
    icon: "📋",
    permission: "VIEW_ACTIVITY_LOGS",
  },
  {
    href: "/users",
    label: "Users",
    icon: "👥",
    permission: "MANAGE_USERS",
  },
];

export default function Home() {
  const [userName, setUserName] =
    useState("Staff");

  const [permissions, setPermissions] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    /*
     * Authentication is stored per browser tab
     * in sessionStorage through auth-storage.ts.
     */
    const token =
      getAuthToken();

    if (!token) {
      window.location.replace(
        "/login",
      );
      return;
    }

    setUserName(
      getUserName() ||
        "Staff",
    );

    setPermissions(
      getPermissions(),
    );

    setLoading(false);
  }, []);

  function canAccess(
    permission?: string,
  ) {
    if (!permission) {
      return true;
    }

    return permissions.includes(
      permission,
    );
  }

  async function handleLogout() {
    const token =
      getAuthToken();

    try {
      if (token) {
        await fetch(
          `${API_BASE_URL}/api/auth/logout`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        );
      }
    } catch {
      // Local logout still happens.
    }

    /*
     * Clear only this browser tab's
     * authentication session.
     */
    clearAuthSession();

    window.location.replace(
      "/login",
    );
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>
          Loading dashboard...
        </div>
      </main>
    );
  }

  const visibleItems =
    menuItems.filter((item) =>
      canAccess(
        item.permission,
      ),
    );

  return (
    <>
      <style>
        {responsiveStyles}
      </style>

      <main className="dashboard-page">
        <div className="dashboard-shell">
          <header className="dashboard-header">
            <div>
              <h1 className="brand-title">
                Food Stall POS
              </h1>

              <p className="welcome-text">
                Welcome{" "}
                <strong>
                  {userName}
                </strong>
              </p>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={
                handleLogout
              }
            >
              Logout
            </button>
          </header>

          <section className="dashboard-hero">
            <div>
              <h2>
                Dashboard
              </h2>

              <p>
                Manage your food stall
                operations from one place.
              </p>
            </div>

            <div className="online-badge">
              ● Online
            </div>
          </section>

          <section className="dashboard-grid">
            {visibleItems.map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="dashboard-card"
                >
                  <div className="card-icon">
                    {item.icon}
                  </div>

                  <div className="card-content">
                    <strong>
                      {item.label}
                    </strong>

                    <span>
                      Open
                    </span>
                  </div>

                  <div className="card-arrow">
                    →
                  </div>
                </Link>
              ),
            )}
          </section>

          {visibleItems.length ===
            0 && (
            <div className="no-access">
              No dashboard sections are
              available for your account.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100dvh",
    background: "#f5f6f8",
    padding: 16,
  },

  loading: {
    minHeight: "80dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: 14,
  },
};

const responsiveStyles = `
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden;
}

body {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background: #f5f6f8;
  color: #111827;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

.dashboard-page {
  min-height: 100dvh;
  padding: 16px;
  background: #f5f6f8;
}

.dashboard-shell {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  background: #ffffff;
  border-radius: 18px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
}

.brand-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.welcome-text {
  margin: 5px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.logout-button {
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  background: #ffffff;
  color: #111827;
  font-weight: 700;
  cursor: pointer;
}

.logout-button:active {
  transform: scale(.98);
}

.dashboard-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 20px;
}

.dashboard-hero h2 {
  margin: 0;
  font-size: 30px;
}

.dashboard-hero p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.online-badge {
  color: #16a34a;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.dashboard-grid {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(190px, 1fr)
    );
  gap: 12px;
}

.dashboard-card {
  position: relative;
  min-height: 135px;
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  color: #111827;
  text-decoration: none;

  display: flex;
  flex-direction: column;
  justify-content: space-between;

  transition:
    transform .12s ease,
    box-shadow .12s ease,
    border-color .12s ease;
}

.dashboard-card:hover {
  transform: translateY(-2px);
  border-color: #cbd5e1;
  box-shadow:
    0 5px 18px
    rgba(0, 0, 0, .06);
}

.dashboard-card:active {
  transform: scale(.98);
}

.card-icon {
  font-size: 29px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-content strong {
  font-size: 17px;
}

.card-content span {
  color: #6b7280;
  font-size: 11px;
}

.card-arrow {
  position: absolute;
  right: 15px;
  bottom: 13px;
  color: #6b7280;
  font-size: 20px;
}

.no-access {
  padding: 20px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  text-align: center;
  color: #6b7280;
}

/* TABLET */

@media (max-width: 768px) {
  .dashboard-page {
    padding: 10px;
  }

  .dashboard-shell {
    padding: 15px;
    border-radius: 14px;
  }

  .brand-title {
    font-size: 24px;
  }

  .dashboard-hero h2 {
    font-size: 25px;
  }

  .dashboard-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

/* ANDROID */

@media (max-width: 600px) {
  .dashboard-page {
    padding: 0;
  }

  .dashboard-shell {
    min-height: 100dvh;
    padding: 10px;
    border-radius: 0;
  }

  .dashboard-header {
    margin-bottom: 20px;
  }

  .brand-title {
    font-size: 21px;
  }

  .welcome-text {
    font-size: 12px;
  }

  .logout-button {
    min-height: 34px;
    padding: 6px 10px;
    font-size: 11px;
  }

  .dashboard-hero {
    margin-bottom: 12px;
  }

  .dashboard-hero h2 {
    font-size: 21px;
  }

  .dashboard-hero p {
    font-size: 11px;
  }

  .online-badge {
    font-size: 9px;
  }

  .dashboard-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .dashboard-card {
    min-height: 105px;
    padding: 11px;
    border-radius: 10px;
  }

  .card-icon {
    font-size: 23px;
  }

  .card-content strong {
    font-size: 13px;
  }

  .card-content span {
    font-size: 9px;
  }

  .card-arrow {
    right: 9px;
    bottom: 8px;
    font-size: 15px;
  }
}

/* VERY SMALL ANDROID */

@media (max-width: 380px) {
  .dashboard-shell {
    padding: 8px;
  }

  .dashboard-grid {
    gap: 5px;
  }

  .dashboard-card {
    min-height: 95px;
    padding: 9px;
  }

  .card-icon {
    font-size: 20px;
  }

  .card-content strong {
    font-size: 12px;
  }
}
`;