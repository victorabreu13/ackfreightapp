import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import TripRequestForm, {
  TripRequestFormValues,
} from "../components/TripRequestForm";
import { createCustomer } from "../services/customers";
import { subscribeToCustomers, subscribeToDrivers } from "../services/users";
import { createTripRequest, newTripRequestId } from "../services/tripRequests";
import { computeTripRequestRollup, UserProfile } from "../types";
import { notify } from "../utils/alert";

export default function DispatchNewRequestScreen({ navigation }: any) {
  const requestId = React.useMemo(() => newTripRequestId(), []);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [search, setSearch] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    const unsubCustomers = subscribeToCustomers(setCustomers, () => {});
    const unsubDrivers = subscribeToDrivers(setDrivers, () => {});
    return () => {
      unsubCustomers();
      unsubDrivers();
    };
  }, []);

  const handleCreateCustomer = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      notify("Missing info", "Enter the new customer's name and email.");
      return;
    }
    setCreatingCustomer(true);
    try {
      const uid = await createCustomer(newName.trim(), newEmail.trim());
      setSelectedCustomer({
        uid,
        name: newName.trim(),
        email: newEmail.trim(),
        role: "customer",
        createdAt: Date.now(),
      });
      notify(
        "Customer created",
        `${newName.trim()} can now log in after setting a password via the reset email we just sent them.`
      );
    } catch (e: any) {
      notify("Couldn't create customer", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleSubmit = async (values: TripRequestFormValues) => {
    if (!selectedCustomer) return;
    const rollup = computeTripRequestRollup(values.awbLines);
    await createTripRequest(requestId, {
      customerId: selectedCustomer.uid,
      customerName: selectedCustomer.name,
      customerEmail: selectedCustomer.email,
      submittedAt: Date.now(),
      ...rollup,
      ...values,
    });
    notify("Trip request created", `Request for ${selectedCustomer.name} has been created.`);
    navigation.navigate("Dispatch");
  };

  const filteredCustomers = customers.filter((c) =>
    `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>New Trip Request</Text>

      {!selectedCustomer ? (
        <>
          <Text style={styles.sectionTitle}>Customer</Text>
          <TextInput
            style={styles.input}
            placeholder="Search existing customers"
            value={search}
            onChangeText={setSearch}
          />
          {filteredCustomers.map((c) => (
            <TouchableOpacity
              key={c.uid}
              style={styles.customerRow}
              onPress={() => setSelectedCustomer(c)}
            >
              <Text style={styles.customerName}>{c.name}</Text>
              <Text style={styles.customerEmail}>{c.email}</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>Or create a new customer</Text>
          <TextInput
            style={styles.input}
            placeholder="Company / customer name"
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={newEmail}
            onChangeText={setNewEmail}
          />
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateCustomer}
            disabled={creatingCustomer}
          >
            {creatingCustomer ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createButtonText}>Create Customer</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.selectedCustomerRow}>
            <View>
              <Text style={styles.customerName}>{selectedCustomer.name}</Text>
              <Text style={styles.customerEmail}>{selectedCustomer.email}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          </View>

          <TripRequestForm
            customerId={selectedCustomer.uid}
            requestId={requestId}
            submitLabel="Create Trip Request"
            onSubmit={handleSubmit}
            driverAssignment={{ drivers }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 22, marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  customerRow: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  customerName: { fontSize: 15, fontWeight: "700", color: "#111" },
  customerEmail: { fontSize: 12, color: "#888", marginTop: 2 },
  createButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  createButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  selectedCustomerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#e8edff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  changeText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
});
