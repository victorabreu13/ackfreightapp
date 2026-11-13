import { goBackOrHome } from "../navigation/goBackOrHome";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BulkTripRequestForm from "../components/BulkTripRequestForm";
import TripRequestForm, {
  TripRequestFormValues,
} from "../components/TripRequestForm";
import { useAuth } from "../context/AuthContext";
import { createTripRequest, newTripRequestId } from "../services/tripRequests";
import { toLocalDateString } from "../utils/date";

export default function NewTripRequestScreen({ navigation }: any) {
  const { user, profile } = useAuth();
  // A screen that stays in the stack under another one (the page was refreshed, or Home was
  // pushed on top after submitting) would come back with the last trip's data and the same
  // request id. Leaving it starts a new session: empty form, new id.
  const [session, setSession] = useState(0);
  const requestId = React.useMemo(() => newTripRequestId(), [session]);
  const [bulk, setBulk] = useState(false);
  React.useEffect(
    () =>
      navigation.addListener("blur", () => {
        setSession((s) => s + 1);
        setBulk(false);
      }),
    [navigation]
  );

  if (!user || !profile) return null;

  const handleSubmit = async (values: TripRequestFormValues) => {
    await createTripRequest(requestId, {
      customerId: user.uid,
      customerName: profile.name,
      customerEmail: profile.email,
      submittedAt: Date.now(),
      assignedDriverIds: [],
      assignedDriverNames: [],
      status: "submitted",
      ...values,
    });
    goBackOrHome(navigation);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => goBackOrHome(navigation)}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Trip Request</Text>
      <Text style={styles.meta}>Customer: {profile.name}</Text>
      <Text style={styles.meta}>
        Submitted: {toLocalDateString(new Date())}
      </Text>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeButton, !bulk && styles.modeButtonOn]} onPress={() => setBulk(false)}>
          <Text style={[styles.modeText, !bulk && styles.modeTextOn]}>One form</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, bulk && styles.modeButtonOn]} onPress={() => setBulk(true)}>
          <Text style={[styles.modeText, bulk && styles.modeTextOn]}>Bulk upload (many AWBs)</Text>
        </TouchableOpacity>
      </View>

      {bulk ? (
        <BulkTripRequestForm key={session} customerId={user.uid} requestId={requestId} onDone={() => goBackOrHome(navigation)} />
      ) : (
        <TripRequestForm
          key={session}
          customerId={user.uid}
          requestId={requestId}
          submitLabel="Submit Trip Request"
          onSubmit={handleSubmit}
          billing={profile}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  meta: { fontSize: 13, color: "#666", marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  modeButton: { borderRadius: 8, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff", paddingVertical: 9, paddingHorizontal: 14 },
  modeButtonOn: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  modeText: { fontSize: 13, fontWeight: "700", color: "#333" },
  modeTextOn: { color: "#fff" },
});
