import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  deleteUserAccount,
  setUserName,
  setUserRole,
  subscribeToAllUsers,
  updateUserEmail,
  updateUserPassword,
} from "../services/users";
import { UserProfile, UserRole } from "../types";
import { confirmAction, notify } from "../utils/alert";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  driver: "Driver",
  customer: "Customer",
};

const ROLES: UserRole[] = ["admin", "driver", "customer"];

export default function ManageUsersScreen({ navigation }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleModalUid, setRoleModalUid] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [editingEmailUid, setEditingEmailUid] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [editingPasswordUid, setEditingPasswordUid] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState("");
  const [editingNameUid, setEditingNameUid] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToAllUsers(
      (data) => {
        setUsers(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const changeRole = (user: UserProfile, role: UserRole) => {
    setRoleModalUid(null);
    if (role === user.role) return;
    confirmAction(
      {
        title: `Change ${user.name} to ${ROLE_LABELS[role]}?`,
        message: `Currently: ${ROLE_LABELS[user.role]}.`,
        confirmLabel: "Change",
      },
      async () => {
        setSavingUid(user.uid);
        try {
          await setUserRole(user.uid, role);
          setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, role } : u)));
        } catch (e: any) {
          notify("Couldn't change role", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setSavingUid(null);
        }
      }
    );
  };

  const startEditingEmail = (user: UserProfile) => {
    setEditingEmailUid(user.uid);
    setEditEmailValue(user.email);
  };

  const saveEmail = async (user: UserProfile) => {
    const email = editEmailValue.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify("Enter a valid email", "That doesn't look like a valid email address.");
      return;
    }
    if (email === user.email) {
      setEditingEmailUid(null);
      return;
    }
    setSavingUid(user.uid);
    try {
      await updateUserEmail(user.uid, email);
      setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, email } : u)));
      setEditingEmailUid(null);
    } catch (e: any) {
      notify("Couldn't change email", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingUid(null);
    }
  };

  const startEditingPassword = (user: UserProfile) => {
    setEditingPasswordUid(user.uid);
    setEditPasswordValue("");
  };

  const savePassword = async (user: UserProfile) => {
    if (editPasswordValue.length < 6) {
      notify("Password too short", "Enter at least 6 characters.");
      return;
    }
    setSavingUid(user.uid);
    try {
      await updateUserPassword(user.uid, editPasswordValue);
      setEditingPasswordUid(null);
      setEditPasswordValue("");
      notify("Password changed", `${user.name}'s password has been updated.`);
    } catch (e: any) {
      notify("Couldn't change password", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingUid(null);
    }
  };

  const startEditingName = (user: UserProfile) => {
    setEditingNameUid(user.uid);
    setEditNameValue(user.name);
  };

  const saveName = async (user: UserProfile) => {
    const name = editNameValue.trim();
    if (!name) {
      notify("Enter a name", "Name can't be empty.");
      return;
    }
    if (name === user.name) {
      setEditingNameUid(null);
      return;
    }
    setSavingUid(user.uid);
    try {
      await setUserName(user.uid, name);
      setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, name } : u)));
      setEditingNameUid(null);
    } catch (e: any) {
      notify("Couldn't save name", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingUid(null);
    }
  };

  const confirmDelete = (user: UserProfile) => {
    confirmAction(
      {
        title: `Delete ${user.name}'s account?`,
        message: `This permanently removes their login and profile (${user.email}). This can't be undone. Their past trips and trip requests stay on record.`,
        confirmLabel: "Delete Account",
        destructive: true,
      },
      async () => {
        setSavingUid(user.uid);
        try {
          await deleteUserAccount(user.uid);
          setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        } catch (e: any) {
          notify("Couldn't delete account", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setSavingUid(null);
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Manage Users</Text>
        <Text style={styles.subtitle}>Fix a wrong role from signup, or change one as needed</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or email"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No users match.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                {editingNameUid === item.uid ? (
                  <View style={styles.nameEditRow}>
                    <TextInput
                      style={styles.emailInput}
                      value={editNameValue}
                      onChangeText={setEditNameValue}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.saveButton} onPress={() => saveName(item)}>
                      <Text style={styles.saveButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingNameUid(null)}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.nameTouchable} onPress={() => startEditingName(item)}>
                    <Text style={styles.userName}>{item.name} · Edit</Text>
                  </TouchableOpacity>
                )}
                {savingUid === item.uid ? (
                  <ActivityIndicator />
                ) : (
                  <TouchableOpacity
                    style={styles.roleButton}
                    onPress={() => setRoleModalUid(item.uid)}
                  >
                    <Text style={styles.roleButtonText}>{ROLE_LABELS[item.role]}</Text>
                    <Text style={styles.chevron}>▾</Text>
                  </TouchableOpacity>
                )}
              </View>

              {editingEmailUid === item.uid ? (
                <View style={styles.emailEditRow}>
                  <TextInput
                    style={styles.emailInput}
                    value={editEmailValue}
                    onChangeText={setEditEmailValue}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoFocus
                  />
                  <TouchableOpacity style={styles.saveButton} onPress={() => saveEmail(item)}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingEmailUid(null)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => startEditingEmail(item)}>
                  <Text style={styles.userEmail}>{item.email} · Edit</Text>
                </TouchableOpacity>
              )}

              {editingPasswordUid === item.uid ? (
                <View style={styles.emailEditRow}>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="New password (min. 6 characters)"
                    value={editPasswordValue}
                    onChangeText={setEditPasswordValue}
                    secureTextEntry
                    autoCapitalize="none"
                    autoFocus
                  />
                  <TouchableOpacity style={styles.saveButton} onPress={() => savePassword(item)}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingPasswordUid(null)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => startEditingPassword(item)}>
                  <Text style={styles.passwordText}>Reset Password</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteRow}>
                <Text style={styles.deleteText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        visible={roleModalUid !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalUid(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRoleModalUid(null)}
        >
          <View style={styles.modalCard}>
            {ROLES.map((role) => {
              const user = users.find((u) => u.uid === roleModalUid);
              return (
                <TouchableOpacity
                  key={role}
                  style={styles.modalOption}
                  onPress={() => user && changeRole(user, role)}
                >
                  <Text style={styles.modalOptionText}>{ROLE_LABELS[role]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginTop: 24, marginLeft: 20, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4 },
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameTouchable: { flex: 1, marginRight: 10 },
  userName: { fontSize: 15, fontWeight: "700", color: "#111" },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 10 },
  userEmail: { fontSize: 13, color: "#1d4ed8", marginTop: 4 },
  emailEditRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  emailInput: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 13 },
  passwordText: { color: "#1d4ed8", fontWeight: "600", fontSize: 13, marginTop: 6 },
  deleteRow: { marginTop: 8, alignSelf: "flex-start" },
  deleteText: { color: "#c0392b", fontWeight: "600", fontSize: 12 },
  roleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8edff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  roleButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  chevron: { color: "#1d4ed8", fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 160 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalOptionText: { fontSize: 16, color: "#111" },
});
