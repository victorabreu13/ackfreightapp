import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { deleteTrip } from "../services/trips";
import { Trip } from "../types";

export default function TripDetailScreen({ route, navigation }: any) {
  const trip: Trip = route.params.trip;
  const { user, profile } = useAuth();
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = profile?.role === "admin" || user?.uid === trip.driverId;

  const performDelete = async () => {
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        "Couldn't delete trip",
        err?.message ?? "Something went wrong. Please try again."
      );
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete this trip?",
      "This can't be undone. The admins will be notified of this deletion.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        {canDelete && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={confirmDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#c0392b" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Trip</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.date}>{trip.date}</Text>
        <Text style={styles.time}>
          {trip.timeStart} – {trip.timeFinish}
        </Text>
      </View>

      <Text style={styles.driver}>{trip.driverName}</Text>
      <Text style={styles.driverEmail}>{trip.driverEmail}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Route</Text>
        <Text style={styles.sectionValue}>
          {trip.from} → {trip.to}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AWB / Document #</Text>
        <Text style={styles.sectionValue}>{trip.awbNumber}</Text>
      </View>

      {!!trip.unitTypes?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>QTY: {trip.qty}</Text>
          <Text style={styles.sectionValue}>
            {trip.unitTypes
              .map((type, i) =>
                trip.uldNumbers?.[i] ? `${type} #${trip.uldNumbers[i]}` : type
              )
              .join(", ")}
          </Text>
        </View>
      )}

      {!!trip.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.sectionValue}>{trip.notes}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Proof of freight ({trip.proofFiles.length})
        </Text>
        {trip.proofFiles.length === 0 && (
          <Text style={styles.noProof}>No files attached.</Text>
        )}
        {trip.proofFiles.map((file, i) =>
          file.kind === "image" ? (
            <TouchableOpacity
              key={i}
              onPress={() => setPreviewImageUrl(file.url)}
            >
              <Image source={{ uri: file.url }} style={styles.image} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              key={i}
              style={styles.docRow}
              onPress={() => Linking.openURL(file.url)}
            >
              <Text style={styles.docName} numberOfLines={1}>
                📄 {file.name}
              </Text>
              <Text style={styles.docOpen}>Open</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setPreviewImageUrl(null)}
        >
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewImageUrl(null)}
          >
            <Text style={styles.previewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {!!previewImageUrl && (
            <Image
              source={{ uri: previewImageUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: { alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  deleteButton: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 90,
    alignItems: "center",
  },
  deleteButtonText: { color: "#c0392b", fontWeight: "700", fontSize: 13 },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  date: { fontSize: 20, fontWeight: "800", color: "#111" },
  time: { fontSize: 16, color: "#555" },
  driver: { fontSize: 16, fontWeight: "700", color: "#1d4ed8", marginTop: 10 },
  driverEmail: { fontSize: 13, color: "#888", marginBottom: 8 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  sectionValue: { fontSize: 16, color: "#111", marginTop: 4 },
  noProof: { color: "#888", marginTop: 6 },
  image: { width: "100%", height: 220, borderRadius: 10, marginTop: 10 },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  docName: { flex: 1, color: "#333", marginRight: 8 },
  docOpen: { color: "#1d4ed8", fontWeight: "700" },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewClose: {
    position: "absolute",
    top: 50,
    right: 24,
    zIndex: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
  },
  previewCloseText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  previewImage: { width: "100%", height: "85%" },
});
