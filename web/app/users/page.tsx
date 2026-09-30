"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAuthToken,
  getUserName,
  getUserId,
  clearAuthSession,
} from "../../lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

const PERMISSIONS = [
  "CREATE_ORDER",
  "VIEW_ORDERS",
  "EDIT_ORDER",
  "CANCEL_ORDER",
  "MARK_READY",
  "MARK_DELIVERED",
  "VIEW_SALES",
  "VIEW_REPORTS",
  "MANAGE_ITEMS",
  "MANAGE_ADDONS",
  "MANAGE_USERS",
  "VIEW_ACTIVITY_LOGS",
  "DAY_CLOSING",
] as const;

type User = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  updatedAt?: string;
  permissions: string[];
};

type ModalType =
  | "CREATE"
  | "EDIT"
  | "PIN"
  | null;

function getToken() {
  return getAuthToken();
}

function normalizePermissions(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item))
          .filter(Boolean);
      }
    } catch {
      // Continue with PostgreSQL-style parsing.
    }

    if (
      trimmed.startsWith("{") &&
      trimmed.endsWith("}")
    ) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) =>
          item
            .trim()
            .replace(/^"|"$/g, ""),
        )
        .filter(Boolean);
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeUser(
  raw: any,
): User {
  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
    status:
      raw?.status === "INACTIVE"
        ? "INACTIVE"
        : "ACTIVE",
    createdAt:
      raw?.createdAt ??
      raw?.created_at,
    updatedAt:
      raw?.updatedAt ??
      raw?.updated_at,
    permissions:
      normalizePermissions(
        raw?.permissions,
      ),
  };
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization:
                `Bearer ${token}`,
            }
          : {}),
        ...(options.headers ?? {}),
      },
    },
  );

  const data =
    await response.json().catch(
      () => null,
    );

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    clearAuthSession();

    if (
      typeof window !==
      "undefined"
    ) {
      window.location.replace(
        "/login",
      );
    }

    throw new Error(
      data?.error ??
        data?.message ??
        "Authentication required.",
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ??
        data?.message ??
        `Request failed (${response.status})`,
    );
  }

  return data as T;
}

function formatDate(
  value?: string,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

function permissionLabel(
  permission: string,
) {
  return permission
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

export default function UsersPage() {
  const [users, setUsers] =
    useState<User[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<
      "ALL" | "ACTIVE" | "INACTIVE"
    >("ALL");

  const [modal, setModal] =
    useState<ModalType>(null);

  const [editingUserId, setEditingUserId] =
    useState<string | null>(null);

  const [userName, setUserName] =
    useState("");

  const [currentUserId, setCurrentUserId] =
    useState("");

  const [formName, setFormName] =
    useState("");

  const [formPin, setFormPin] =
    useState("");

  const [formPermissions, setFormPermissions] =
    useState<string[]>([]);

  const [newPin, setNewPin] =
    useState("");

  useEffect(() => {
    const token = getToken();

    if (!token) {
      window.location.href =
        "/login";
      return;
    }

    setUserName(getUserName());
    setCurrentUserId(getUserId());

    void loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const data =
        await apiRequest<{
          success: boolean;
          users?: unknown[];
        }>("/api/users");

      const normalized = (
        data.users ?? []
      ).map(normalizeUser);

      setUsers(normalized);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load users.",
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingUserId(null);
    setFormName("");
    setFormPin("");

    setFormPermissions([
      "CREATE_ORDER",
      "VIEW_ORDERS",
    ]);

    setError("");
    setSuccess("");
    setModal("CREATE");
  }

  function openEdit(user: User) {
    setEditingUserId(user.id);
    setFormName(user.name);
    setFormPermissions([
      ...normalizePermissions(
        user.permissions,
      ),
    ]);

    setError("");
    setSuccess("");
    setModal("EDIT");
  }

  function openPin(user: User) {
    setEditingUserId(user.id);
    setNewPin("");

    setError("");
    setSuccess("");
    setModal("PIN");
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModal(null);
    setEditingUserId(null);
    setFormName("");
    setFormPin("");
    setFormPermissions([]);
    setNewPin("");
  }

  function togglePermission(
    permission: string,
  ) {
    setFormPermissions((current) => {
      const safeCurrent =
        normalizePermissions(
          current,
        );

      if (
        safeCurrent.includes(
          permission,
        )
      ) {
        return safeCurrent.filter(
          (item) =>
            item !== permission,
        );
      }

      return [
        ...safeCurrent,
        permission,
      ];
    });
  }

  function selectAllPermissions() {
    setFormPermissions([
      ...PERMISSIONS,
    ]);
  }

  function clearPermissions() {
    setFormPermissions([]);
  }

  async function createUser() {
    const name = formName.trim();

    if (!name) {
      setError(
        "Enter the staff name.",
      );
      return;
    }

    if (!/^\d{6}$/.test(formPin)) {
      setError(
        "PIN must contain exactly 6 digits.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await apiRequest(
        "/api/users",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            pin: formPin,
            permissions:
              normalizePermissions(
                formPermissions,
              ),
          }),
        },
      );

      closeModal();

      setSuccess(
        "Staff user created successfully.",
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create user.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUser() {
    if (!editingUserId) {
      return;
    }

    const name = formName.trim();

    if (!name) {
      setError(
        "Enter the staff name.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await apiRequest(
        `/api/users/${editingUserId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            permissions:
              normalizePermissions(
                formPermissions,
              ),
          }),
        },
      );

      closeModal();

      setSuccess(
        "Staff user updated successfully.",
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update user.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePin() {
    if (!editingUserId) {
      return;
    }

    if (!/^\d{6}$/.test(newPin)) {
      setError(
        "PIN must contain exactly 6 digits.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await apiRequest(
        `/api/users/${editingUserId}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({
            pin: newPin,
          }),
        },
      );

      const changedUser =
        users.find(
          (user) =>
            user.id ===
            editingUserId,
        );

      closeModal();

      setSuccess(
        `${changedUser?.name ?? "Staff"}'s PIN was changed and their previous session was invalidated.`,
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to change PIN.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(
    user: User,
  ) {
    const nextStatus =
      user.status === "ACTIVE"
        ? "INACTIVE"
        : "ACTIVE";

    const confirmed =
      window.confirm(
        nextStatus === "INACTIVE"
          ? `Deactivate ${user.name}?\n\nTheir current session will be invalidated immediately.`
          : `Activate ${user.name}?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await apiRequest(
        `/api/users/${user.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      setSuccess(
        nextStatus === "INACTIVE"
          ? `${user.name} was deactivated and their session was invalidated.`
          : `${user.name} was activated.`,
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update user status.",
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return users.filter((user) => {
        const safePermissions =
          normalizePermissions(
            user.permissions,
          );

        const matchesStatus =
          statusFilter === "ALL" ||
          user.status ===
            statusFilter;

        const matchesSearch =
          !query ||
          user.name
            .toLowerCase()
            .includes(query) ||
          safePermissions.some(
            (permission) =>
              permission
                .toLowerCase()
                .includes(query),
          );

        return (
          matchesStatus &&
          matchesSearch
        );
      });
    }, [
      users,
      search,
      statusFilter,
    ]);

  const activeCount =
    users.filter(
      (user) =>
        user.status ===
        "ACTIVE",
    ).length;

  const inactiveCount =
    users.filter(
      (user) =>
        user.status ===
        "INACTIVE",
    ).length;

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>
          Loading Users...
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <nav style={styles.navbar}>
          <strong style={styles.brand}>
            Food Stall POS
          </strong>

          <div style={styles.navLinks}>
            <Link
              href="/"
              style={styles.navLink}
            >
              Dashboard
            </Link>

            <Link
              href="/pos"
              style={styles.navLink}
            >
              + New Order
            </Link>

            <Link
              href="/orders"
              style={styles.navLink}
            >
              Orders
            </Link>

            <Link
              href="/menu"
              style={styles.navLink}
            >
              Menu
            </Link>

            <Link
              href="/users"
              style={{
                ...styles.navLink,
                ...styles.activeNavLink,
              }}
            >
              Users
            </Link>
          </div>

          <button
            type="button"
            style={styles.logoutButton}
            onClick={() => {
              clearAuthSession();

              window.location.replace(
                "/login",
              );
            }}
          >
            Logout
          </button>
        </nav>

        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              User Management
            </h1>

            <p style={styles.subtitle}>
              Manage staff accounts,
              PINs and permissions.
            </p>

            <p style={styles.loggedIn}>
              Logged in as{" "}
              <strong>
                {userName || "Staff"}
              </strong>
            </p>
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={openCreate}
          >
            + Add Staff
          </button>
        </header>

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        {success && (
          <div style={styles.success}>
            {success}
          </div>
        )}

        <section style={styles.stats}>
          <div style={styles.stat}>
            <span>Total Staff</span>
            <strong>
              {users.length}
            </strong>
          </div>

          <div style={styles.stat}>
            <span>Active</span>
            <strong>
              {activeCount}
            </strong>
          </div>

          <div style={styles.stat}>
            <span>Inactive</span>
            <strong>
              {inactiveCount}
            </strong>
          </div>
        </section>

        <section style={styles.toolbar}>
          <input
            style={styles.search}
            placeholder="Search staff..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />

          <select
            style={styles.filter}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target
                  .value as
                  | "ALL"
                  | "ACTIVE"
                  | "INACTIVE",
              )
            }
          >
            <option value="ALL">
              All Status
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>
          </select>
        </section>

        <section style={styles.userGrid}>
          {filteredUsers.length ===
          0 ? (
            <div style={styles.empty}>
              <strong>
                No staff users found
              </strong>

              <p>
                Create a staff account
                to begin.
              </p>
            </div>
          ) : (
            filteredUsers.map(
              (user) => {
                const safePermissions =
                  normalizePermissions(
                    user.permissions,
                  );

                return (
                  <article
                    key={user.id}
                    style={styles.userCard}
                  >
                    <div
                      style={
                        styles.userHeader
                      }
                    >
                      <div
                        style={
                          styles.avatar
                        }
                      >
                        {user.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div
                        style={
                          styles.userInfo
                        }
                      >
                        <h2
                          style={
                            styles.userName
                          }
                        >
                          {user.name}
                        </h2>

                        <span
                          style={{
                            ...styles.status,
                            ...(user.status ===
                            "ACTIVE"
                              ? styles.statusActive
                              : styles.statusInactive),
                          }}
                        >
                          {user.status ===
                          "ACTIVE"
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={
                        styles.details
                      }
                    >
                      <div
                        style={
                          styles.detailRow
                        }
                      >
                        <span>
                          Permissions
                        </span>

                        <strong>
                          {
                            safePermissions.length
                          }
                        </strong>
                      </div>

                      <div
                        style={
                          styles.permissionList
                        }
                      >
                        {safePermissions
                          .slice(0, 6)
                          .map(
                            (
                              permission,
                            ) => (
                              <span
                                key={
                                  permission
                                }
                                style={
                                  styles.permissionBadge
                                }
                              >
                                {permissionLabel(
                                  permission,
                                )}
                              </span>
                            ),
                          )}

                        {safePermissions.length >
                          6 && (
                          <span
                            style={
                              styles.moreBadge
                            }
                          >
                            +
                            {safePermissions.length -
                              6}{" "}
                            more
                          </span>
                        )}
                      </div>

                      <div
                        style={
                          styles.created
                        }
                      >
                        Created{" "}
                        {formatDate(
                          user.createdAt,
                        )}
                      </div>
                    </div>

                    <div
                      style={
                        styles.actions
                      }
                    >
                      <button
                        type="button"
                        style={
                          styles.editButton
                        }
                        onClick={() =>
                          openEdit(
                            user,
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        style={
                          styles.pinButton
                        }
                        onClick={() =>
                          openPin(
                            user,
                          )
                        }
                      >
                        Change PIN
                      </button>

                      {user.id !==
                        currentUserId && (
                        <button
                          type="button"
                          style={
                            user.status ===
                            "ACTIVE"
                              ? styles.deactivateButton
                              : styles.activateButton
                          }
                          onClick={() =>
                            toggleStatus(
                              user,
                            )
                          }
                          disabled={
                            saving
                          }
                        >
                          {user.status ===
                          "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              },
            )
          )}
        </section>
      </div>

      {modal === "CREATE" && (
        <Modal
          title="Add Staff"
          subtitle="Create a new staff account with a unique 6-digit PIN."
          onClose={closeModal}
          saving={saving}
        >
          <label style={styles.label}>
            Staff Name
          </label>

          <input
            style={styles.input}
            value={formName}
            onChange={(event) =>
              setFormName(
                event.target.value,
              )
            }
            placeholder="e.g. Rahul"
            autoFocus
          />

          <label style={styles.label}>
            6-Digit PIN
          </label>

          <input
            style={styles.input}
            value={formPin}
            onChange={(event) =>
              setFormPin(
                event.target.value
                  .replace(
                    /\D/g,
                    "",
                  )
                  .slice(0, 6),
              )
            }
            placeholder="••••••"
            inputMode="numeric"
            maxLength={6}
            type="password"
          />

          <PermissionSelector
            selected={formPermissions}
            onToggle={
              togglePermission
            }
            onSelectAll={
              selectAllPermissions
            }
            onClear={
              clearPermissions
            }
          />

          <ModalActions
            onCancel={closeModal}
            onSave={createUser}
            saving={saving}
            label="Create Staff"
          />
        </Modal>
      )}

      {modal === "EDIT" && (
        <Modal
          title="Edit Staff"
          subtitle="Update the staff name and permissions."
          onClose={closeModal}
          saving={saving}
        >
          <label style={styles.label}>
            Staff Name
          </label>

          <input
            style={styles.input}
            value={formName}
            onChange={(event) =>
              setFormName(
                event.target.value,
              )
            }
            autoFocus
          />

          <PermissionSelector
            selected={formPermissions}
            onToggle={
              togglePermission
            }
            onSelectAll={
              selectAllPermissions
            }
            onClear={
              clearPermissions
            }
          />

          <ModalActions
            onCancel={closeModal}
            onSave={updateUser}
            saving={saving}
            label="Save Changes"
          />
        </Modal>
      )}

      {modal === "PIN" && (
        <Modal
          title="Change PIN"
          subtitle="Changing the PIN immediately invalidates the staff member's current session."
          onClose={closeModal}
          saving={saving}
        >
          <label style={styles.label}>
            New 6-Digit PIN
          </label>

          <input
            style={styles.input}
            value={newPin}
            onChange={(event) =>
              setNewPin(
                event.target.value
                  .replace(
                    /\D/g,
                    "",
                  )
                  .slice(0, 6),
              )
            }
            placeholder="••••••"
            inputMode="numeric"
            maxLength={6}
            type="password"
            autoFocus
          />

          <ModalActions
            onCancel={closeModal}
            onSave={changePin}
            saving={saving}
            label="Change PIN"
          />
        </Modal>
      )}
    </main>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  saving,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div
          style={
            styles.modalHeader
          }
        >
          <div>
            <h2
              style={
                styles.modalTitle
              }
            >
              {title}
            </h2>

            <p
              style={
                styles.modalSubtitle
              }
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            style={styles.close}
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function PermissionSelector({
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  selected: string[];
  onToggle: (
    permission: string,
  ) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const safeSelected =
    normalizePermissions(
      selected,
    );

  return (
    <div
      style={
        styles.permissionSection
      }
    >
      <div
        style={
          styles.permissionHeader
        }
      >
        <div>
          <strong>
            Permissions
          </strong>

          <span
            style={
              styles.permissionCount
            }
          >
            {safeSelected.length}{" "}
            selected
          </span>
        </div>

        <div
          style={
            styles.permissionControls
          }
        >
          <button
            type="button"
            style={
              styles.smallButton
            }
            onClick={
              onSelectAll
            }
          >
            Select All
          </button>

          <button
            type="button"
            style={
              styles.smallButton
            }
            onClick={
              onClear
            }
          >
            Clear
          </button>
        </div>
      </div>

      <div
        style={
          styles.permissionGrid
        }
      >
        {PERMISSIONS.map(
          (permission) => {
            const checked =
              safeSelected.includes(
                permission,
              );

            return (
              <label
                key={permission}
                style={{
                  ...styles.permissionRow,
                  ...(checked
                    ? styles.permissionSelected
                    : {}),
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onToggle(
                      permission,
                    )
                  }
                />

                <span>
                  {permissionLabel(
                    permission,
                  )}
                </span>
              </label>
            );
          },
        )}
      </div>
    </div>
  );
}

function ModalActions({
  onCancel,
  onSave,
  saving,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div
      style={
        styles.modalActions
      }
    >
      <button
        type="button"
        style={
          styles.secondaryButton
        }
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>

      <button
        type="button"
        style={
          styles.primaryButton
        }
        onClick={onSave}
        disabled={saving}
      >
        {saving
          ? "Saving..."
          : label}
      </button>
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
    boxSizing: "border-box",
  },

  container: {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxSizing: "border-box",
  },

  loading: {
    maxWidth: 500,
    margin: "100px auto",
    padding: 30,
    textAlign: "center",
    background: "#fff",
    borderRadius: 14,
  },

  navbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 7,
    marginBottom: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    background: "#f8fafc",
    overflowX: "auto",
  },

  brand: {
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  navLinks: {
    display: "flex",
    gap: 4,
    flex: 1,
  },

  navLink: {
    textDecoration: "none",
    color: "#334155",
    padding: "6px 9px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  activeNavLink: {
    background: "#111827",
    color: "#fff",
  },

  logoutButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 6,
    padding: "6px 9px",
    fontSize: 10,
    cursor: "pointer",
    fontWeight: 700,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 15,
  },

  title: {
    margin: 0,
    fontSize: 29,
  },

  subtitle: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: 13,
  },

  loggedIn: {
    margin: "5px 0 0",
    color: "#94a3b8",
    fontSize: 10,
  },

  primaryButton: {
    border: 0,
    borderRadius: 7,
    background: "#111827",
    color: "#fff",
    padding: "9px 12px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  secondaryButton: {
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    color: "#374151",
    padding: "9px 12px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 700,
  },

  error: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: 12,
    fontWeight: 700,
  },

  success: {
    padding: 9,
    marginBottom: 9,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    fontSize: 12,
    fontWeight: 700,
  },

  stats: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,minmax(0,1fr))",
    gap: 7,
    marginBottom: 10,
  },

  stat: {
    padding: 11,
    border: "1px solid #e5e7eb",
    borderRadius: 9,
  },

  toolbar: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0,1fr) 180px",
    gap: 7,
    marginBottom: 10,
  },

  search: {
    width: "100%",
    boxSizing: "border-box",
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: 11,
  },

  filter: {
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    fontSize: 11,
  },

  userGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2,minmax(0,1fr))",
    gap: 8,
  },

  userCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  },

  userHeader: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111827",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
  },

  userInfo: {
    minWidth: 0,
  },

  userName: {
    margin: 0,
    fontSize: 14,
  },

  status: {
    display: "inline-block",
    marginTop: 4,
    padding: "3px 7px",
    borderRadius: 5,
    fontSize: 8,
    fontWeight: 800,
  },

  statusActive: {
    background: "#dcfce7",
    color: "#166534",
  },

  statusInactive: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  details: {
    marginTop: 11,
  },

  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "#64748b",
    fontSize: 9,
  },

  permissionList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 7,
  },

  permissionBadge: {
    padding: "3px 5px",
    borderRadius: 4,
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 7,
    fontWeight: 700,
  },

  moreBadge: {
    padding: "3px 5px",
    borderRadius: 4,
    background: "#e0e7ff",
    color: "#3730a3",
    fontSize: 7,
    fontWeight: 700,
  },

  created: {
    marginTop: 8,
    color: "#94a3b8",
    fontSize: 8,
  },

  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 11,
  },

  editButton: {
    border: "1px solid #2563eb",
    background: "#fff",
    color: "#2563eb",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  pinButton: {
    border: "1px solid #7c3aed",
    background: "#fff",
    color: "#7c3aed",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  deactivateButton: {
    border: "1px solid #dc2626",
    background: "#fff",
    color: "#dc2626",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  activateButton: {
    border: "1px solid #16a34a",
    background: "#fff",
    color: "#15803d",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 800,
  },

  empty: {
    gridColumn: "1 / -1",
    padding: 40,
    textAlign: "center",
    border: "1px solid #e5e7eb",
    borderRadius: 9,
    color: "#64748b",
  },

  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background:
      "rgba(15,23,42,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
  },

  modal: {
    width: "100%",
    maxWidth: 570,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 12,
    padding: 17,
    boxSizing: "border-box",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  modalTitle: {
    margin: 0,
    fontSize: 18,
  },

  modalSubtitle: {
    margin: "3px 0 0",
    color: "#64748b",
    fontSize: 10,
  },

  close: {
    border: 0,
    background: "#f1f5f9",
    width: 30,
    height: 30,
    borderRadius: 6,
    fontSize: 20,
    cursor: "pointer",
  },

  label: {
    display: "block",
    marginTop: 10,
    marginBottom: 5,
    fontSize: 10,
    fontWeight: 800,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 9,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: 12,
  },

  permissionSection: {
    marginTop: 15,
    paddingTop: 12,
    borderTop:
      "1px solid #e5e7eb",
  },

  permissionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  permissionCount: {
    marginLeft: 7,
    color: "#64748b",
    fontSize: 9,
  },

  permissionControls: {
    display: "flex",
    gap: 4,
  },

  smallButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 5,
    padding: "4px 6px",
    fontSize: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  permissionGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2,minmax(0,1fr))",
    gap: 5,
  },

  permissionRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 7,
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    fontSize: 9,
    cursor: "pointer",
  },

  permissionSelected: {
    background: "#eff6ff",
    border:
      "1px solid #93c5fd",
  },

  modalActions: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: 7,
    marginTop: 16,
  },
};