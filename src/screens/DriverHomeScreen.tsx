import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotifications, syncBadgeCount } from "../services/notifications";
import { setOnDuty } from "../services/users";
import { notify } from "../utils/alert";

const TILES = [
  {
    key: "JobBoard",
    icon: "📋",
    label: "Open Jobs",
    description: "Unassigned AWBs you can accept while on duty",
  },
  {
    key: "MyTripRequests",
    icon: "🚚",
    label: "Trip Requests",
    description: "Trips assigned to you, or that you accepted",
  },
  {
    key: "NewTrip",
    icon: "➕",
    label: "Log New Trip",
    description: "Manually log a trip you just drove",
  },
  {
    key: "TripHistory",
    icon: "📜",
    label: "Trip History",
    description: "Every trip you've completed and logged",
  },
  {
    key: "DriverEarnings",
    icon: "💵",
    label: "Earnings",
    description: "Today, this week, and past weeks",
  },
] as const;

export default function DriverHomeScreen({ navigation }: any) {
  const { user, profile, signOut } = useAuth();
  const [onDuty, setOnDutyState] = useState(profile?.onDuty === true);
  const [savingDuty, setSavingDuty] = useState(false);

  useEffect(() => {
    setOnDutyState(profile?.onDuty === true);
  }, [profile?.onDuty]);

  useEffect(() => {
    registerForPushNotifications();
    if (user) syncBadgeCount(user.uid);
  }, [user]);

  const toggleDuty = async (next: boolean) => {
    setOnDutyState(next);
    setSavingDuty(true);
    try {
      await setOnDuty(next);
    } catch (err: any) {
      setOnDutyState(!next);
      notify("Couldn't update duty", err?.message ?? "Try again.");
    } finally {
      setSavingDuty(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {profile?.name?.split(" ")[0]}</Text>
          <Text style={styles.subGreeting}>ACK Freight Driver</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dutyCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dutyTitle}>{onDuty ? "On duty" : "Off duty"}</Text>
          <Text style={styles.dutyHint}>
            {onDuty
              ? "Open jobs are visible. Dispatch can still assign you directly."
              : "Turn this on to see unassigned AWBs."}
          </Text>
        </View>
        <Switch value={onDuty} onValueChange={toggleDuty} disabled={savingDuty} />
      </View>

      <View style={styles.tileGrid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.key}
            style={styles.tile}
            onPress={() => navigation.navigate(tile.key)}
          >
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileDescription}>{tile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  greeting: { fontSize: 24, fontWeight: "800", color: "#111" },
  subGreeting: { fontSize: 14, color: "#666" },
  signOut: { color: "#c0392b", fontSize: 15, fontWeight: "600" },
  dutyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 16,
    padding: 16,
  },
  dutyTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  dutyHint: { fontSize: 13, color: "#666", marginTop: 4, paddingRight: 12 },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    paddingHorizontal: 24,
  },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    width: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tileIcon: { fontSize: 44, marginBottom: 14 },
  tileLabel: { fontSize: 18, fontWeight: "800", color: "#111", marginBottom: 6 },
  tileDescription: { fontSize: 13, color: "#888", textAlign: "center" },
});
