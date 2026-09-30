import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import TripRequestForm, {
  TripRequestFormValues,
} from "../components/TripRequestForm";
import { useAuth } from "../context/AuthContext";
import { createTripRequest, newTripRequestId } from "../services/tripRequests";
import { toLocalDateString } from "../utils/date";

export default function NewTripRequestScreen({ navigation }: any) {
  const { user, profile } = useAuth();
  const requestId = React.useMemo(() => newTripRequestId(), []);

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
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Trip Request</Text>
      <Text style={styles.meta}>Customer: {profile.name}</Text>
      <Text style={styles.meta}>
        Submitted: {toLocalDateString(new Date())}
      </Text>

      <TripRequestForm
        customerId={user.uid}
        requestId={requestId}
        submitLabel="Submit Trip Request"
        onSubmit={handleSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  meta: { fontSize: 13, color: "#666", marginTop: 4 },
});
