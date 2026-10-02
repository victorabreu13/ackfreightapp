import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateField from "../components/DateField";
import { useAuth } from "../context/AuthContext";
import { checkDuplicateUld, createTrip, duplicateUldMessage } from "../services/trips";
import { uploadProofFile } from "../services/storage";
import { ProofFile, ULD_TYPES, UldType } from "../types";
import { confirmAction, notify } from "../utils/alert";
import { toLocalDateString as formatDate } from "../utils/date";

type PendingFile = {
  uri: string;
  name: string;
  kind: ProofFile["kind"];
};

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5); // HH:mm
}

export default function NewTripScreen({ navigation }: any) {
  const { user, profile } = useAuth();

  const [date, setDate] = useState(new Date());
  const [timeStart, setTimeStart] = useState(new Date());
  const [timeFinish, setTimeFinish] = useState(new Date());

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState(1);
  const [unitTypes, setUnitTypes] = useState<UldType[]>(["Loose"]);
  const [uldNumbers, setUldNumbers] = useState<string[]>([""]);
  const [typeModalIndex, setTypeModalIndex] = useState<number | null>(null);
  const [awbNumber, setAwbNumber] = useState("");
  const [kilograms, setKilograms] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const changeQty = (n: number) => {
    setQty(n);
    setUnitTypes((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("Loose");
      return next;
    });
    setUldNumbers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  };

  const selectUnitType = (index: number, type: UldType) => {
    setUnitTypes((prev) => {
      const next = [...prev];
      next[index] = type;
      return next;
    });
    setTypeModalIndex(null);
  };

  const setUldNumberAt = (index: number, value: string) => {
    setUldNumbers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      notify("Camera permission is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFiles((f) => [
        ...f,
        { uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, kind: "image" },
      ]);
    }
  };

  const addFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      setFiles((f) => [
        ...f,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? `photo-${Date.now()}.jpg`,
          kind: "image" as const,
        })),
      ]);
    }
  };

  const addDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: ["application/pdf", "image/*"],
    });
    if (!result.canceled) {
      setFiles((f) => [
        ...f,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          kind: "document" as const,
        })),
      ]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((f) => f.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    if (!from.trim() || !to.trim()) {
      notify("Missing info", "Enter both the From and To locations.");
      return;
    }
    if (!awbNumber.trim()) {
      notify("Missing info", "Enter the AWB / Document number.");
      return;
    }
    if (uldNumbers.some((u) => !u.trim())) {
      notify("Missing info", "Enter the ULD # for each unit.");
      return;
    }
    if (files.length === 0) {
      confirmAction(
        {
          title: "No proof attached",
          message:
            "Attach at least one photo or document as proof of the freight before submitting.",
          confirmLabel: "Submit anyway",
          cancelLabel: "Attach now",
        },
        () => submit()
      );
      return;
    }
    submit();
  };

  const submit = async () => {
    if (!user || !profile) return;
    setSubmitting(true);
    try {
      const trimmedUlds = uldNumbers.map((u) => u.trim());
      const dup = await checkDuplicateUld(awbNumber.trim(), trimmedUlds);
      if (dup.duplicate) {
        notify("Duplicate ULD #", duplicateUldMessage(dup.uldNumber, "submitting"));
        return;
      }

      const uploaded: ProofFile[] = [];
      for (const file of files) {
        const proof = await uploadProofFile(
          file.uri,
          user.uid,
          file.name,
          file.kind
        );
        uploaded.push(proof);
      }

      await createTrip({
        driverId: user.uid,
        driverName: profile.name,
        driverEmail: profile.email,
        date: formatDate(date),
        timeStart: formatTime(timeStart),
        timeFinish: formatTime(timeFinish),
        from: from.trim(),
        to: to.trim(),
        qty,
        unitTypes,
        uldNumbers: trimmedUlds,
        awbNumber: awbNumber.trim(),
        kilograms: parseFloat(kilograms) || 0,
        notes: notes.trim(),
        proofFiles: uploaded,
      });

      navigation.goBack();
    } catch (e: any) {
      console.error("createTrip error:", e);
      notify("Error", `Couldn't save the trip: ${e?.message ?? "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Date</Text>
      <DateField value={date} mode="date" onChange={setDate} />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Time start</Text>
          <DateField value={timeStart} mode="time" onChange={setTimeStart} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Time finish</Text>
          <DateField value={timeFinish} mode="time" onChange={setTimeFinish} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>From</Text>
          <TextInput
            style={styles.input}
            placeholder="Origin"
            value={from}
            onChangeText={setFrom}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>To</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination"
            value={to}
            onChangeText={setTo}
          />
        </View>
      </View>

      <Text style={styles.label}>QTY</Text>
      <View style={styles.row}>
        {[1, 2, 3].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.qtyButton, qty === n && styles.qtyButtonActive]}
            onPress={() => changeQty(n)}
          >
            <Text
              style={[
                styles.qtyButtonText,
                qty === n && styles.qtyButtonTextActive,
              ]}
            >
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {unitTypes.map((type, i) => (
        <View key={i}>
          <Text style={styles.label}>
            Type{unitTypes.length > 1 ? ` (Unit ${i + 1})` : ""}
          </Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setTypeModalIndex(i)}
          >
            <Text style={styles.pickerText}>{type}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>
            ULD #{unitTypes.length > 1 ? ` (Unit ${i + 1})` : ""}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. AKE12345AA"
            value={uldNumbers[i] ?? ""}
            onChangeText={(v) => setUldNumberAt(i, v)}
            autoCapitalize="characters"
          />
        </View>
      ))}

      <Modal
        visible={typeModalIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTypeModalIndex(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTypeModalIndex(null)}
        >
          <View style={styles.modalCard}>
            {ULD_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.modalOption}
                onPress={() =>
                  typeModalIndex !== null && selectUnitType(typeModalIndex, t)
                }
              >
                <Text style={styles.modalOptionText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Text style={styles.label}>AWB / Document #</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. AWB-102938"
        value={awbNumber}
        onChangeText={setAwbNumber}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Kilograms</Text>
      <TextInput
        style={styles.input}
        placeholder="Total weight for this trip"
        keyboardType="numeric"
        value={kilograms}
        onChangeText={setKilograms}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Anything else worth noting"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.label}>Proof of freight</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.attachButton} onPress={addPhoto}>
          <Text style={styles.attachButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachButton} onPress={addFromLibrary}>
          <Text style={styles.attachButtonText}>Photo Library</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachButton} onPress={addDocument}>
          <Text style={styles.attachButtonText}>Document</Text>
        </TouchableOpacity>
      </View>

      {files.map((f, i) => (
        <View key={`${f.uri}-${i}`} style={styles.fileRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {f.name}
          </Text>
          <TouchableOpacity onPress={() => removeFile(i)}>
            <Text style={styles.removeFile}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Trip</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 16, marginBottom: 6 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  pickerButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerText: { fontSize: 15, color: "#111" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  notesInput: { minHeight: 70, textAlignVertical: "top" },
  qtyButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    alignItems: "center",
  },
  qtyButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  qtyButtonText: { fontSize: 15, fontWeight: "700", color: "#333" },
  qtyButtonTextActive: { color: "#fff" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalOptionText: { fontSize: 16, color: "#111" },
  attachButton: {
    flex: 1,
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  attachButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  fileName: { flex: 1, fontSize: 13, color: "#333", marginRight: 8 },
  removeFile: { color: "#c0392b", fontSize: 13, fontWeight: "600" },
  submitButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 40,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
