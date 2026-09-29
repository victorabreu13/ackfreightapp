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
import { setUserRole, subscribeToAllUsers } from "../services/users";
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
              <View style={styles.cardInfo}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardInfo: { flex: 1, marginRight: 10 },
  userName: { fontSize: 15, fontWeight: "700", color: "#111" },
  userEmail: { fontSize: 13, color: "#666", marginTop: 2 },
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
    padding: 32,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalOptionText: { fontSize: 16, color: "#111" },
});
