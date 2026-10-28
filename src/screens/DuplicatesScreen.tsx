import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { mergeDuplicateRequests, subscribeToAllTripRequests } from "../services/tripRequests";
import { TripRequest } from "../types";
import { confirmAction, notify } from "../utils/alert";
import { documentCount, DuplicateGroup, duplicateRequestGroups, previewCopies, suggestedKeep } from "../utils/duplicateRequests";

// Admin: trip requests that carry the same AWB. Pick the one to keep and merge the
// others into it: the documents it is missing are copied over, and the duplicate AWB
// leaves the other request.
export default function DuplicatesScreen({ navigation }: any) {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToAllTripRequests(
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  const groups = useMemo(() => duplicateRequestGroups(requests), [requests]);

  const keepFor = (group: DuplicateGroup): TripRequest =>
    group.requests.find((r) => r.id === keepChoice[group.key]) ?? suggestedKeep(group);

  const merge = (group: DuplicateGroup) => {
    const keep = keepFor(group);
    const others = group.requests.filter((r) => r.id !== keep.id);
    confirmAction(
      {
        title: `Merge AWB ${group.awbNumber}?`,
        message: `${others.length} duplicate trip request${others.length === 1 ? "" : "s"} will be merged into ${keep.customerName} · ${keep.tripDate}. Missing documents are copied over and the duplicate AWB is taken off the other request${others.length === 1 ? "" : "s"}. This can't be undone.`,
        confirmLabel: "Merge",
        destructive: true,
      },
      async () => {
        setMerging(group.key);
        try {
          let copied = 0;
          for (const other of others) {
            const result = await mergeDuplicateRequests(keep.id, other.id);
            copied += result.copied.length + result.importFeeAdded;
          }
          notify("Merged", copied > 0 ? `${copied} document${copied === 1 ? "" : "s"} added to the trip request you kept.` : "Merged. There was nothing missing to copy.");
        } catch (e: any) {
          notify("Couldn't merge", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setMerging(null);
        }
      }
    );
  };

  return (
    <AdminShell navigation={navigation} active="Duplicates" title="Duplicate AWBs" subtitle="Trip requests that carry the same AWB">
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : groups.length === 0 ? (
        <Text style={styles.none}>✓ No AWB is on more than one active trip request.</Text>
      ) : (
        <>
          <Text style={styles.intro}>
            {groups.length} AWB{groups.length === 1 ? " is" : "s are"} on more than one trip request. Choose the one to keep; the
            documents it's missing are copied from the others.
          </Text>
          {groups.map((group) => {
            const keep = keepFor(group);
            return (
              <View key={group.key} style={styles.group}>
                <Text style={styles.awb}>AWB {group.awbNumber}</Text>
                {group.requests.map((r) => {
                  const isKeep = r.id === keep.id;
                  const adds = isKeep ? [] : previewCopies(keep, r, group.key);
                  return (
                    <TouchableOpacity key={r.id} style={[styles.card, isKeep && styles.cardKeep]} onPress={() => setKeepChoice((c) => ({ ...c, [group.key]: r.id }))}>
                      <View style={styles.cardTop}>
                        <Text style={styles.radio}>{isKeep ? "◉" : "○"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>
                            {r.customerName} · {r.tripDate}
                          </Text>
                          <Text style={styles.cardLine}>
                            {r.from} → {r.to} · {r.status}
                            {r.assignedDriverNames?.length ? ` · ${r.assignedDriverNames.join(", ")}` : ""}
                          </Text>
                          <Text style={styles.cardLine}>
                            Documents on this AWB: {documentCount(r, group.key)} of 3
                            {r.importFeeFiles?.length ? ` · ${r.importFeeFiles.length} import fee file${r.importFeeFiles.length === 1 ? "" : "s"}` : ""}
                          </Text>
                          {isKeep ? (
                            <Text style={styles.keepTag}>Keep this one</Text>
                          ) : (
                            <Text style={styles.addsText}>
                              {adds.length > 0 ? `Adds to the kept one: ${adds.join(", ")}` : "Nothing to add from this one"}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate("DispatchDetail", { request: r })}>
                          <Text style={styles.open}>Open</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.mergeButton} onPress={() => merge(group)} disabled={merging === group.key}>
                  {merging === group.key ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.mergeText}>Merge into the one I'm keeping</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  none: { color: "#15803d", fontWeight: "600", fontSize: 14, marginTop: 10 },
  intro: { color: "#475569", fontSize: 13.5, lineHeight: 20, marginBottom: 12 },
  group: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, marginBottom: 14 },
  awb: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, marginBottom: 8 },
  cardKeep: { borderColor: "#1d4ed8", backgroundColor: "#f5f8ff" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  radio: { fontSize: 20, color: "#1d4ed8", marginTop: -2 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  cardLine: { fontSize: 12.5, color: "#64748b", marginTop: 2 },
  keepTag: { fontSize: 12.5, fontWeight: "700", color: "#1d4ed8", marginTop: 4 },
  addsText: { fontSize: 12.5, color: "#15803d", fontWeight: "600", marginTop: 4 },
  open: { fontSize: 12.5, fontWeight: "700", color: "#1d4ed8" },
  mergeButton: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 4 },
  mergeText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
