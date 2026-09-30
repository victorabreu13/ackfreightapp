import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { setTripInvoiced, subscribeToAllTrips } from "../services/trips";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { Trip } from "../types";
import DateField from "../components/DateField";
import TripCard from "../components/TripCard";
import { notify } from "../utils/alert";
import { toLocalDateString as formatDate } from "../utils/date";

export default function DriversLogScreen({ navigation }: any) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | null>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [invoicedTripLogIds, setInvoicedTripLogIds] = useState<Set<string>>(new Set());

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

  // A Trip Log entry is "invoiced" once the trip request it came from has
  // been invoiced — invoicing happens at the whole-request level, not per
  // AWB line, so every tripLogId under an invoiced request counts.
  useEffect(() => {
    const unsubscribe = subscribeToAllTripRequests(
      (requests) => {
        const ids = new Set<string>();
        for (const request of requests) {
          if (request.status !== "invoiced") continue;
          for (const line of request.awbLines) {
            if (line.tripLogId) ids.add(line.tripLogId);
          }
        }
        setInvoicedTripLogIds(ids);
      },
      () => {}
    );
    return unsubscribe;
  }, []);

  // A search takes priority over the date filter — you're looking for one
  // specific AWB wherever it is, not narrowing within the current date.
  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return trips.filter((t) => t.awbNumber.toLowerCase().includes(q));
    }
    if (!filterDate) return trips;
    const target = formatDate(filterDate);
    return trips.filter((t) => t.date === target);
  }, [trips, filterDate, searchQuery]);

  const driverCount = useMemo(
    () => new Set(filteredTrips.map((t) => t.driverId)).size,
    [filteredTrips]
  );

  const toggleInvoiced = async (trip: Trip) => {
    try {
      await setTripInvoiced(trip.id, !trip.invoiced);
    } catch (e: any) {
      notify("Couldn't update", e?.message ?? "Something went wrong. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Drivers Log</Text>
          <Text style={styles.subtitle}>
            {filteredTrips.length} trip{filteredTrips.length === 1 ? "" : "s"} ·{" "}
            {driverCount} driver{driverCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <TextInput
        style={[styles.searchInput, Platform.OS === "web" && styles.searchInputWeb]}
        placeholder="Search by AWB #"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="characters"
      />

      {!searchQuery.trim() && (
        <View style={styles.filterRow}>
          <View style={styles.filterDateField}>
            <DateField
              value={filterDate ?? new Date()}
              mode="date"
              onChange={setFilterDate}
              label={filterDate ? undefined : "All dates"}
            />
          </View>
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
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filteredTrips.length === 0 ? (
        <Text style={styles.empty}>
          {searchQuery.trim() ? "No trips match that AWB search." : "No trips logged for this filter."}
        </Text>
      ) : (
        <FlatList
          data={filteredTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              showDriver
              invoiced={invoicedTripLogIds.has(item.id) || !!item.invoiced}
              invoicedLocked={invoicedTripLogIds.has(item.id)}
              onToggleInvoiced={() => toggleInvoiced(item)}
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
  backButton: { marginTop: 24, marginLeft: 20, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666" },
  signOut: { color: "#c0392b", fontSize: 14, fontWeight: "600" },
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  searchInputWeb: { width: "25%" as any, minWidth: 160, marginHorizontal: 16 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterDateField: { flex: 1 },
  filterButtonSecondary: {
    backgroundColor: "#e8edff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  filterButtonSecondaryText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
});
