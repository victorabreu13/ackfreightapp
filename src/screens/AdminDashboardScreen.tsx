import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { dispatchStyles } from "../components/DispatchUI";
import { registerForPushNotifications } from "../services/notifications";
import {
  disconnectQuickBooks,
  getQuickBooksConnectUrl,
  getQuickBooksStatus,
} from "../services/quickbooks";
import { confirmAction, notify } from "../utils/alert";

// "Settings" in the admin menu. The route keeps its old name
// (AdminDashboard) so the header logo, push-notification taps and existing
// links still land somewhere valid. The day-to-day screens moved to the
// side menu (Today, Live Map, Trips, …); the rarely used admin tools stay here.
const TILES = [
  {
    key: "ManageUsers",
    icon: "👤",
    label: "Users",
    description: "Roles, logins, activate/deactivate, each driver's pay agreement",
  },
  {
    key: "PayAgreement",
    icon: "🤝",
    label: "Default driver pay",
    description: "Company default for drivers with no agreement",
  },
  {
    key: "DeletedTrips",
    icon: "🗑️",
    label: "Deleted trip logs",
    description: "Restore a trip log that was deleted by mistake",
    webOnly: true,
  },
] as const;

export default function AdminDashboardScreen({ navigation }: any) {
  const [qbStatus, setQbStatus] = useState<{
    connected: boolean;
    companyName?: string | null;
    environment?: string;
    realmId?: string;
  } | null>(null);

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    getQuickBooksStatus()
      .then(setQbStatus)
      .catch((err) => console.error("getQuickBooksStatus error:", err));
  }, []);

  const handleConnectQuickBooks = async () => {
    // Open the tab synchronously (within the click event) so browsers don't
    // treat it as a popup — the URL comes back from an async call.
    const tab = window.open("", "_blank");
    try {
      const url = await getQuickBooksConnectUrl();
      if (tab) tab.location.href = url;
    } catch (e: any) {
      if (tab) tab.close();
      notify("Couldn't start QuickBooks connection", e?.message ?? "Something went wrong. Please try again.");
    }
  };

  const handleDisconnectQuickBooks = () => {
    confirmAction(
      {
        title: "Disconnect QuickBooks?",
        message: "You'll need to reconnect before sending any more invoices.",
        confirmLabel: "Disconnect",
        destructive: true,
      },
      async () => {
        try {
          await disconnectQuickBooks();
          setQbStatus({ connected: false });
        } catch (e: any) {
          notify("Couldn't disconnect", e?.message ?? "Something went wrong. Please try again.");
        }
      }
    );
  };

  const tiles = TILES.filter((t) => !("webOnly" in t && t.webOnly) || Platform.OS === "web");

  return (
    <AdminShell navigation={navigation} active="AdminDashboard" title="Settings">
      <View style={styles.tileGrid}>
        {tiles.map((tile) => (
          <TouchableOpacity key={tile.key} style={styles.tile} onPress={() => navigation.navigate(tile.key)}>
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileDescription}>{tile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {Platform.OS === "web" && (
        <View style={dispatchStyles.section}>
          <Text style={dispatchStyles.sectionTitle}>QuickBooks</Text>
          {!qbStatus ? (
            <Text style={dispatchStyles.muted}>Checking connection…</Text>
          ) : qbStatus.connected ? (
            <View style={styles.qbRow}>
              <Text style={styles.qbConnectedText}>
                ✅ Connected{qbStatus.companyName ? ` · ${qbStatus.companyName}` : ""}
                {qbStatus.environment === "sandbox" ? " (sandbox)" : ""}
                {qbStatus.realmId ? ` · realmId: ${qbStatus.realmId}` : ""}
              </Text>
              <TouchableOpacity onPress={handleDisconnectQuickBooks}>
                <Text style={styles.qbDisconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={handleConnectQuickBooks}>
              <Text style={styles.qbConnectText}>🔗 Connect QuickBooks to send invoices</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={dispatchStyles.section}>
        <Text style={dispatchStyles.sectionTitle}>Coming in phase 2</Text>
        <Text style={dispatchStyles.muted}>
          Trucks (26', 53' enclosed, flatbed), stops with appointment windows, and arrival/departure times.
        </Text>
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 14 },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e3e7ef",
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    width: 220,
  },
  tileIcon: { fontSize: 34, marginBottom: 10 },
  tileLabel: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 6 },
  tileDescription: { fontSize: 12.5, color: "#888", textAlign: "center" },
  qbRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  qbConnectText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  qbConnectedText: { color: "#15803d", fontWeight: "600", fontSize: 13, flexShrink: 1 },
  qbDisconnectText: { color: "#c0392b", fontWeight: "600", fontSize: 12 },
});
