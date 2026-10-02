import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SignaturePreview } from "./SignaturePad";
import { getTripRequestProofs, TripProofGroup } from "../services/tripRequests";

// Loaded through getTripRequestProofs so the customer never gets read access
// to the trips collection. Shows nothing until at least one AWB on this
// request has been completed (the function only returns linked trip logs).
export default function CustomerProofSection({ requestId }: { requestId: string }) {
  const [proofs, setProofs] = useState<TripProofGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProofs(null);
    setError(null);
    getTripRequestProofs(requestId)
      .then((data) => {
        if (!cancelled) setProofs(data);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err?.message ?? "Couldn't load proof of delivery.");
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (error) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proof of delivery</Text>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (!proofs) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proof of delivery</Text>
        <ActivityIndicator />
      </View>
    );
  }

  if (proofs.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Proof of delivery</Text>
      {proofs.map((group) => (
        <View key={group.tripLogId} style={styles.card}>
          {group.awbNumbers.length > 0 && (
            <Text style={styles.awbLabel}>AWB {group.awbNumbers.join(", ")}</Text>
          )}
          {group.signatureStrokes?.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.awbLabel}>Signature</Text>
              <SignaturePreview strokes={group.signatureStrokes} />
            </View>
          )}
          {group.signature?.url && (
            <TouchableOpacity style={styles.docRow} onPress={() => Linking.openURL(group.signature!.url)}>
              <Text style={styles.docName} numberOfLines={1}>
                ✍️ {group.signature.name || "Signature"}
              </Text>
              <Text style={styles.docOpen}>Open</Text>
            </TouchableOpacity>
          )}
          {group.proofFiles.length === 0 && !group.signature && (
            <Text style={styles.muted}>No files were attached for this drop.</Text>
          )}
          {group.proofFiles.map((file, index) =>
            file.kind === "image" ? (
              <TouchableOpacity key={`${file.url}-${index}`} onPress={() => setPreviewUrl(file.url)}>
                <Image source={{ uri: file.url }} style={styles.image} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={`${file.url}-${index}`}
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
      ))}

      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setPreviewUrl(null)}
        >
          <Text style={styles.previewClose}>✕ Close</Text>
          {!!previewUrl && (
            <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginBottom: 10 },
  muted: { fontSize: 13, color: "#888" },
  card: { backgroundColor: "#f0f2fa", borderRadius: 12, padding: 12, marginBottom: 12 },
  awbLabel: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8 },
  image: { width: "100%", height: 180, borderRadius: 8, marginTop: 8, backgroundColor: "#ddd" },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  docName: { flex: 1, color: "#333", marginRight: 8 },
  docOpen: { color: "#1d4ed8", fontWeight: "700" },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  previewClose: { color: "#fff", fontWeight: "700", fontSize: 16, marginBottom: 16 },
  previewImage: { width: "100%", height: "80%" },
});
