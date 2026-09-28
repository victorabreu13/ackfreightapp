import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { listDeletedTrips, restoreDeletedTrip } from "../services/trips";
import { DeletedTrip } from "../types";
import { confirmAction, notify } from "../utils/alert";

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString();
}

export default function DeletedTripsScreen({ navigation }: any) {
  const [deletedTrips, setDeletedTrips] = useState<DeletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listDeletedTrips();
      setDeletedTrips(data);
    } catch (e: any) {
      notify("Couldn't load deleted trips", e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doRestore = async (item: DeletedTrip) => {
    setRestoringId(item.id);
    try {
      await restoreDeletedTrip(item.id);
      setDeletedTrips((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, restoredAt: Date.now() } : d))
      );
      notify("Restored", "The trip is back in the Drivers Log.");
    } catch (e: any) {
      notify("Couldn't restore", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setRestoringId(null);
    }
  };

  const confirmRestore = (item: DeletedTrip) => {
    confirmAction(
      {
        title: "Restore this trip?",
        message: `${item.trip.driverName} · ${item.trip.awbNumber} · ${item.trip.date}`,
        confirmLabel: "Restore",
      },
      () => doRestore(item)
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Deleted Trips</Text>
        <Text style={styles.subtitle}>
          Last {deletedTrips.length} deleted trip{deletedTrips.length === 1 ? "" : "s"} — restore
          any that were removed by mistake.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : deletedTrips.length === 0 ? (
        <Text style={styles.empty}>No deleted trips.</Text>
      ) : (
        <FlatList
          data={deletedTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {item.trip.awbNumber || "No AWB"} · {item.trip.driverName}
                </Text>
                {item.restoredAt ? (
                  <Text style={styles.restoredBadge}>Restored</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={() => confirmRestore(item)}
                    disabled={restoringId === item.id}
                  >
                    {restoringId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.restoreButtonText}>Restore</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.cardMeta}>
                {item.trip.from} → {item.trip.to} · {item.trip.date} · {item.trip.kilograms} kg
              </Text>
              <Text style={styles.cardMeta}>
                Deleted by {item.deletedBy?.name ?? "Unknown"} ({item.deletedBy?.role ?? "?"}) on{" "}
                {formatWhen(item.deletedAt)}
              </Text>
            </View>
          )}
        />
      )}
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
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111", flex: 1, marginRight: 10 },
  cardMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  restoreButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  restoreButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  restoredBadge: { color: "#2e7d32", fontWeight: "700", fontSize: 13 },
});
