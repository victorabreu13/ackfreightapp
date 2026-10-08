import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { acceptOpenAwb, listOpenJobs, OpenJob } from "../services/tripRequests";
import { setOnDuty } from "../services/users";
import { notify } from "../utils/alert";
import { payHeadline, routeSummary } from "../utils/driverPayDisplay";

function cargoLine(job: OpenJob): string {
  const dims =
    job.lengthIn || job.widthIn || job.heightIn
      ? ` · ${job.lengthIn ?? "–"}×${job.widthIn ?? "–"}×${job.heightIn ?? "–"} in`
      : "";
  const hazmat = job.hazmat
    ? ` · HAZMAT${job.unNumber ? ` UN${job.unNumber}` : ""}${job.hazmatClass ? ` class ${job.hazmatClass}` : ""}`
    : "";
  return `${job.type || "Loose"} · ${job.qtyPieces} pcs · ${job.kilograms} kg${dims}${hazmat}`;
}

export default function JobBoardScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [onDuty, setOnDutyState] = useState(profile?.onDuty === true);
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOnDutyState(profile?.onDuty === true);
  }, [profile?.onDuty]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let origin: { lat: number; lng: number } | undefined;
      try {
        const current = await Location.getForegroundPermissionsAsync();
        const status =
          current.status === "granted"
            ? "granted"
            : current.status === "undetermined"
              ? (await Location.requestForegroundPermissionsAsync()).status
              : current.status;
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        origin = undefined;
      }
      setJobs(await listOpenJobs(origin));
    } catch (err: any) {
      setJobs([]);
      setError(err?.message ?? "Couldn't load the job board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (onDuty) load();
    else {
      setJobs([]);
      setError(null);
    }
  }, [onDuty, load]);

  const toggleDuty = async (next: boolean) => {
    setOnDutyState(next);
    try {
      await setOnDuty(next);
    } catch (err: any) {
      setOnDutyState(!next);
      notify("Couldn't update duty", err?.message ?? "Try again.");
    }
  };

  const accept = async (job: OpenJob) => {
    const key = `${job.requestId}-${job.awbIndex}`;
    setAcceptingKey(key);
    try {
      await acceptOpenAwb(job.requestId, job.awbIndex);
      setJobs((prev) => prev.filter((item) => `${item.requestId}-${item.awbIndex}` !== key));
      notify("AWB accepted", `${job.awbNumber || "This AWB"} is yours. Open it and tap Start when you begin.`);
      navigation.navigate("MyTripRequests");
    } catch (err: any) {
      const message = err?.message ?? "Couldn't accept that AWB.";
      if (message.toLowerCase().includes("already")) {
        notify("Already taken", "Another driver accepted this AWB first.");
        setJobs((prev) => prev.filter((item) => `${item.requestId}-${item.awbIndex}` !== key));
      } else {
        notify("Couldn't accept", message);
      }
    } finally {
      setAcceptingKey(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Open jobs</Text>
          <Text style={styles.subtitle}>Unassigned AWBs. First accept wins.</Text>
        </View>
        <View style={styles.duty}>
          <Text style={styles.dutyLabel}>{onDuty ? "On duty" : "Off duty"}</Text>
          <Switch value={onDuty} onValueChange={toggleDuty} />
        </View>
      </View>

      {!onDuty ? (
        <Text style={styles.empty}>Turn on duty to see AWBs that dispatch has not assigned yet.</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : jobs.length === 0 ? (
        <Text style={styles.empty}>No open AWBs right now.</Text>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => `${item.requestId}-${item.awbIndex}`}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => {
            const key = `${item.requestId}-${item.awbIndex}`;
            const pay = payHeadline(item.pay);
            const drive = routeSummary(item.miles, item.driveMinutes, item.milesApproximate);
            return (
              <View style={styles.card}>
                <Text style={[styles.pay, !pay.quoted && styles.payUnset]}>{pay.text}</Text>
                <Text style={styles.route}>
                  {item.from} → {item.to}
                </Text>
                {!!drive && <Text style={styles.meta}>{drive}</Text>}
                <Text style={styles.meta}>
                  {item.tripDate}
                  {item.pickupTime ? ` · pickup ${item.pickupTime}` : ""}
                  {item.priority && item.priority !== "Normal" ? ` · ${item.priority}` : ""}
                </Text>
                <Text style={styles.awb}>{item.awbNumber || "AWB"}</Text>
                <Text style={styles.meta}>{cargoLine(item)}</Text>
                {pay.quoted &&
                  item.pay.breakdown.map((part) => (
                    <Text key={part.label} style={styles.meta}>
                      {part.label} · ${part.amount.toFixed(2)}
                    </Text>
                  ))}
                {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                <TouchableOpacity
                  style={[styles.accept, !pay.quoted && styles.acceptDisabled]}
                  onPress={() => accept(item)}
                  disabled={acceptingKey === key || !pay.quoted}
                >
                  {acceptingKey === key ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.acceptText}>{pay.quoted ? "Accept" : "Waiting on dispatch"}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4 },
  duty: { alignItems: "flex-end" },
  dutyLabel: { fontSize: 12, fontWeight: "700", color: "#333", marginBottom: 4 },
  empty: { textAlign: "center", color: "#666", marginTop: 40, paddingHorizontal: 32 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  pay: { fontSize: 32, fontWeight: "800", color: "#111" },
  payUnset: { fontSize: 18, color: "#92400e" },
  route: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 6 },
  awb: { fontSize: 15, fontWeight: "700", color: "#1d4ed8", marginTop: 8 },
  meta: { fontSize: 13, color: "#555", marginTop: 4 },
  notes: { fontSize: 13, color: "#666", marginTop: 6 },
  accept: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  acceptDisabled: { backgroundColor: "#94a3b8" },
  acceptText: { color: "#fff", fontWeight: "700" },
});
