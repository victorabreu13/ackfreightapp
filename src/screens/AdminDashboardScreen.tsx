import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { subscribeToAllTrips } from "../services/trips";
import { Trip } from "../types";
import TripCard from "../components/TripCard";

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminDashboardScreen({ navigation }: any) {
  const { signOut } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | null>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAllTrips(
      (data) => {
        setTrips(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const filteredTrips = useMemo(() => {
    if (!filterDate) return trips;
    const target = formatDate(filterDate);
    return trips.filter((t) => t.date === target);
  }, [trips, filterDate]);

  const driverCount = useMemo(
    () => new Set(filteredTrips.map((t) => t.driverId)).size,
    [filteredTrips]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team Log</Text>
          <Text style={styles.subtitle}>
            {filteredTrips.length} trip{filteredTrips.length === 1 ? "" : "s"} ·{" "}
            {driverCount} driver{driverCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {Platform.OS === "web" && (
            <>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={() => navigation.navigate("Dispatch")}
              >
                <Text style={styles.recordButtonText}>Dispatch</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={() => navigation.navigate("DriversRecord")}
              >
                <Text style={styles.recordButtonText}>Drivers Record</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.signOut}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.filterButtonText}>
            {filterDate ? formatDate(filterDate) : "All dates"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterButtonSecondary}
          onPress={() => setFilterDate(new Date())}
        >
          <Text style={styles.filterButtonSecondaryText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterButtonSecondary}
          onPress={() => setFilterDate(null)}
        >
          <Text style={styles.filterButtonSecondaryText}>All</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={filterDate ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selected) => {
            setShowPicker(Platform.OS === "ios");
            if (selected) setFilterDate(selected);
          }}
        />
      )}
      {showPicker && Platform.OS === "ios" && (
        <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filteredTrips.length === 0 ? (
        <Text style={styles.empty}>No trips logged for this filter.</Text>
      ) : (
        <FlatList
          data={filteredTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              showDriver
              onPress={() => navigation.navigate("TripDetail", { trip: item })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666" },
  signOut: { color: "#c0392b", fontSize: 14, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  recordButton: {
    backgroundColor: "#e8edff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  recordButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    alignItems: "center",
  },
  filterButtonText: { color: "#111", fontWeight: "600" },
  filterButtonSecondary: {
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  filterButtonSecondaryText: { color: "#1d4ed8", fontWeight: "700" },
  doneButton: { alignSelf: "flex-end", padding: 8, marginRight: 16 },
  doneButtonText: { color: "#1d4ed8", fontWeight: "700" },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
});
