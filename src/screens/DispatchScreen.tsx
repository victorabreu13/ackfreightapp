import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AdminShell from "../components/AdminShell";
import DateField from "../components/DateField";
import { Btn, cargoSummary, StagePill, to12h } from "../components/DispatchUI";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { TripRequest } from "../types";
import { toLocalDateString } from "../utils/date";
import { isOpenStage } from "../utils/dispatchBoard";
import { STAGE_ORDER, stageInfo, tripStage, TripStage, unassignedCount } from "../utils/tripStatus";

type StageFilter = TripStage | "open" | "all";

// One chip per unified trip stage (see utils/tripStatus.ts), plus "Open"
// (everything not yet delivered) and "All".
const FILTERS: { key: StageFilter; label: string }[] = [
  { key: "open", label: "Open" },
  ...STAGE_ORDER.map((s) => ({ key: s as StageFilter, label: stageInfo(s).label })),
  { key: "all", label: "All" },
];

// "Trips" in the admin menu (route name kept as Dispatch so existing links
// and the /dispatch URL keep working). Website leads moved to New Requests
// and the QuickBooks connection moved to Settings.
export default function DispatchScreen({ navigation, route }: any) {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StageFilter>(route?.params?.stage ?? "open");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(
    route?.params?.customer ? String(route.params.customer).trim().toLowerCase() : null
  );
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAllTripRequests(
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (route?.params?.customer) setCustomerFilter(String(route.params.customer).trim().toLowerCase());
    if (route?.params?.stage) setFilter(route.params.stage);
  }, [route?.params?.customer, route?.params?.stage]);

  // Customer names who actually have trip requests, for the customer filter
  // — unified by name (case-insensitively) rather than customerId, since the
  // same real-world customer can have multiple login accounts (different
  // emails, or names typed with different capitalization) that should
  // filter together as one entry. customerFilter holds the lowercase key;
  // the button/modal show the first-seen casing as the display label.
  const customerNames = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach((r) => {
      const key = r.customerName.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, r.customerName.trim());
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requests]);
  const customerName = customerFilter
    ? customerNames.find((c) => c.key === customerFilter)?.label ?? customerFilter
    : "All Clients";

  // Customer filter stays applied even while searching (narrowing an AWB
  // search to one customer is useful); status and date only apply outside
  // of a search — you're looking for one specific AWB wherever it is, not
  // narrowing within the current status/date filter.
  // Customer filter stays applied even while searching (narrowing an AWB
  // search to one customer is useful); status and date only apply outside
  // of a search — you're looking for one specific AWB wherever it is, not
  // narrowing within the current status/date filter.
  const filtered = useMemo(() => {
    const byCustomer = customerFilter
      ? requests.filter((r) => r.customerName.trim().toLowerCase() === customerFilter)
      : requests;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return byCustomer.filter((r) =>
        r.awbLines.some((l) => l.awbNumber.toLowerCase().includes(q))
      );
    }
    let result =
      filter === "all"
        ? byCustomer
        : filter === "open"
        ? byCustomer.filter((r) => isOpenStage(tripStage(r)))
        : byCustomer.filter((r) => tripStage(r) === filter);
    if (filterStartDate) {
      const start = toLocalDateString(filterStartDate);
      result = result.filter((r) => r.tripDate >= start);
    }
    if (filterEndDate) {
      const end = toLocalDateString(filterEndDate);
      result = result.filter((r) => r.tripDate <= end);
    }
    return result;
  }, [requests, filter, searchQuery, filterStartDate, filterEndDate, customerFilter]);

  return (
    <AdminShell
      navigation={navigation}
      active="Dispatch"
      title="Trips"
      subtitle={`${filtered.length} trip${filtered.length === 1 ? "" : "s"}`}
      scroll={false}
      right={<Btn label="+ New trip" primary onPress={() => navigation.navigate("DispatchNewRequest")} />}
    >
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.customerButton}
          onPress={() => setCustomerModalOpen(true)}
        >
          <Text style={styles.customerButtonText}>Client: {customerName}</Text>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.searchInput, Platform.OS === "web" && styles.searchInputWeb]}
          placeholder="Search by AWB #"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
        />
      </View>

      {!searchQuery.trim() && (
        <>
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const color = f.key === "open" || f.key === "all" ? "#0A1A3A" : stageInfo(f.key).color;
              const on = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterButton, on && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterButtonText, { color: on ? "#fff" : color }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.dateFilterRow}>
            <View style={styles.filterDateField}>
              <Text style={styles.miniLabel}>From</Text>
              <DateField
                value={filterStartDate ?? new Date()}
                mode="date"
                onChange={setFilterStartDate}
                label={filterStartDate ? undefined : "Any"}
              />
            </View>
            <View style={styles.filterDateField}>
              <Text style={styles.miniLabel}>To</Text>
              <DateField
                value={filterEndDate ?? new Date()}
                mode="date"
                onChange={setFilterEndDate}
                label={filterEndDate ? undefined : "Any"}
              />
            </View>
            <TouchableOpacity
              style={styles.filterButtonSecondary}
              onPress={() => {
                const today = new Date();
                setFilterStartDate(today);
                setFilterEndDate(today);
              }}
            >
              <Text style={styles.filterButtonSecondaryText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterButtonSecondary}
              onPress={() => {
                setFilterStartDate(null);
                setFilterEndDate(null);
              }}
            >
              <Text style={styles.filterButtonSecondaryText}>All</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>
          {searchQuery.trim()
            ? "No trip has an AWB matching that search."
            : "No trips for this filter."}
        </Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            const stage = tripStage(item);
            const cargo = cargoSummary(item);
            const missing = unassignedCount(item);
            return (
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: stageInfo(stage).color }]}
                onPress={() =>
                  navigation.navigate("DispatchDetail", { request: item })
                }
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>
                    {item.tripDate} · {to12h(item.pickupTime)}
                  </Text>
                  <StagePill stage={stage} />
                </View>
                <Text style={styles.cardCustomer}>{item.customerName}</Text>
                <Text style={styles.cardRoute}>
                  {item.from} → {item.to}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.awbLines.length} AWB{item.awbLines.length === 1 ? "" : "s"}
                  {cargo.units ? ` · ${cargo.units}` : ""}
                  {cargo.kg ? ` · ${cargo.kg.toLocaleString("en-US")} kg` : ""}
                  {item.assignedDriverNames.length > 0
                    ? ` · Driver: ${item.assignedDriverNames.join(", ")}`
                    : ""}
                </Text>
                {missing > 0 && stage !== "requested" && (
                  <Text style={styles.cardMissing}>
                    {missing} AWB{missing === 1 ? "" : "s"} still need a driver
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={customerModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCustomerModalOpen(false)}
        >
          <View style={styles.modalCard}>
            <ScrollView>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setCustomerFilter(null);
                  setCustomerModalOpen(false);
                }}
              >
                <Text style={styles.modalOptionText}>All Clients</Text>
              </TouchableOpacity>
              {customerNames.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={styles.modalOption}
                  onPress={() => {
                    setCustomerFilter(key);
                    setCustomerModalOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 8,
  },
  searchInputWeb: { width: 260, minWidth: 160 },
  customerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  customerButtonText: { color: "#111", fontWeight: "600", fontSize: 14 },
  chevron: { color: "#888", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 220,
    maxHeight: "70%",
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalOptionText: { fontSize: 16, color: "#111" },
  miniLabel: { fontSize: 11, fontWeight: "700", color: "#888", marginBottom: 4 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  filterButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  dateFilterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 8,
  },
  filterDateField: {},
  filterButtonSecondary: {
    backgroundColor: "#e8edff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  filterButtonSecondaryText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderLeftWidth: 4,
    padding: 12,
    marginVertical: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: { fontSize: 15, fontWeight: "700", color: "#111" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  cardMissing: { color: "#b91c1c", fontWeight: "800", fontSize: 12, marginTop: 4 },
  cardCustomer: { fontSize: 14, fontWeight: "700", color: "#1d4ed8", marginTop: 6 },
  cardRoute: { fontSize: 14, color: "#333", marginTop: 2 },
  cardMeta: { fontSize: 12, color: "#888", marginTop: 4 },
});
