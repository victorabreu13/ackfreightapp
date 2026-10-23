import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { subscribeToAllTrips } from "../services/trips";
import { Trip, TripRequest } from "../types";
import { matchesTokens } from "../utils/search";

const LIMIT = 40;

// Admin: one search box over everything. Finds trip requests (customer, route,
// drivers, AWBs, notes…) and the drivers' trip logs (AWB, ULD #, driver, route…),
// however an AWB number was typed.
export default function SearchScreen({ navigation }: any) {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loaded, setLoaded] = useState({ requests: false, trips: false });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const a = subscribeToAllTripRequests(
      (data) => {
        setRequests(data);
        setLoaded((l) => ({ ...l, requests: true }));
      },
      () => setLoaded((l) => ({ ...l, requests: true }))
    );
    const b = subscribeToAllTrips(
      (data) => {
        setTrips(data);
        setLoaded((l) => ({ ...l, trips: true }));
      },
      () => setLoaded((l) => ({ ...l, trips: true }))
    );
    return () => {
      a();
      b();
    };
  }, []);

  const q = query.trim();
  const requestHits = useMemo(
    () =>
      q
        ? requests.filter((r) =>
            matchesTokens(
              [
                r.customerName,
                r.customerEmail,
                r.from,
                r.to,
                r.personRequesting,
                r.notes,
                r.tripDate,
                r.status,
                ...(r.assignedDriverNames ?? []),
                ...(r.awbLines ?? []).map((l) => l.awbNumber),
              ],
              q
            )
          )
        : [],
    [requests, q]
  );
  const tripHits = useMemo(
    () =>
      q
        ? trips.filter((t) =>
            matchesTokens(
              [t.awbNumber, t.driverName, t.driverEmail, t.from, t.to, t.notes, t.date, ...(t.uldNumbers ?? [])],
              q
            )
          )
        : [],
    [trips, q]
  );
  const loading = !loaded.requests || !loaded.trips;

  return (
    <AdminShell navigation={navigation} active="Search" title="Search" subtitle="Trip requests and trip logs">
      <TextInput
        style={styles.input}
        placeholder="AWB, ULD #, customer, driver, place, note…"
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : !q ? (
        <Text style={styles.hint}>
          Type part of an AWB number (dashes and spaces don't matter), a customer, a driver, a place or a ULD #.
        </Text>
      ) : (
        <>
          <Text style={styles.section}>
            Trip requests ({requestHits.length}){requestHits.length > LIMIT ? ` · showing ${LIMIT}` : ""}
          </Text>
          {requestHits.length === 0 && <Text style={styles.none}>No trip request matches.</Text>}
          {requestHits.slice(0, LIMIT).map((r) => (
            <TouchableOpacity key={r.id} style={styles.card} onPress={() => navigation.navigate("DispatchDetail", { request: r })}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{r.customerName}</Text>
                <Text style={styles.badge}>{r.status}</Text>
              </View>
              <Text style={styles.cardLine}>
                {r.tripDate} · {r.from} → {r.to}
              </Text>
              <Text style={styles.cardLine}>
                AWB {(r.awbLines ?? []).map((l) => l.awbNumber).join(", ")}
                {r.assignedDriverNames?.length ? ` · ${r.assignedDriverNames.join(", ")}` : ""}
              </Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.section}>
            Trip logs ({tripHits.length}){tripHits.length > LIMIT ? ` · showing ${LIMIT}` : ""}
          </Text>
          {tripHits.length === 0 && <Text style={styles.none}>No trip log matches.</Text>}
          {tripHits.slice(0, LIMIT).map((t) => (
            <TouchableOpacity key={t.id} style={styles.card} onPress={() => navigation.navigate("TripDetail", { trip: t })}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{t.driverName}</Text>
                <Text style={styles.badge}>{t.paid ? "paid" : "unpaid"}</Text>
              </View>
              <Text style={styles.cardLine}>
                {t.date} · {t.from} → {t.to}
              </Text>
              <Text style={styles.cardLine}>
                AWB {t.awbNumber}
                {(t.uldNumbers ?? []).filter(Boolean).length ? ` · ULD ${(t.uldNumbers ?? []).filter(Boolean).join(", ")}` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  hint: { color: "#64748b", fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  section: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 14, marginBottom: 8 },
  none: { color: "#94a3b8", fontSize: 13, marginBottom: 6 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0f172a" },
  badge: { fontSize: 12, fontWeight: "700", color: "#475569", backgroundColor: "#f1f5f9", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cardLine: { fontSize: 12.5, color: "#64748b", marginTop: 3 },
});
