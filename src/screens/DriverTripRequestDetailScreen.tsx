import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import { useAuth } from "../context/AuthContext";
import { uploadProofFile } from "../services/storage";
import { checkDuplicateUld, createTrip } from "../services/trips";
import { completeTripRequest, startTripRequest } from "../services/tripRequests";
import { ProofFile, TripRequest, TripRequestStatus } from "../types";
import { confirmAction, notify } from "../utils/alert";

type PendingFile = { uri: string; name: string; kind: ProofFile["kind"] };

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5);
}

export default function DriverTripRequestDetailScreen({ route, navigation }: any) {
  const { user, profile } = useAuth();
  const initialRequest: TripRequest = route.params.request;
  const [request, setRequest] = useState(initialRequest);
  const [starting, setStarting] = useState(false);

  const [timeStart, setTimeStart] = useState(new Date());
  const [timeFinish, setTimeFinish] = useState(new Date());
  const [showPicker, setShowPicker] = useState<"start" | "finish" | null>(null);
  const [uldNumbers, setUldNumbers] = useState<string[]>(
    request.awbLines.map(() => "")
  );
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [completing, setCompleting] = useState(false);

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

  const handleStart = () => {
    confirmAction(
      { title: "Start this trip?", confirmLabel: "Start Trip" },
      async () => {
        setStarting(true);
        try {
          await startTripRequest(request.id);
          setRequest((prev) => ({ ...prev, status: "in_progress" }));
        } catch (e: any) {
          notify("Couldn't start trip", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setStarting(false);
        }
      }
    );
  };

  const handleComplete = async () => {
    if (!user || !profile) return;
    if (uldNumbers.some((u) => !u.trim())) {
      notify("Missing info", "Enter the ULD # for each AWB.");
      return;
    }
    if (files.length === 0) {
      confirmAction(
        {
          title: "No proof attached",
          message: "Attach at least one photo or document as proof of the freight before completing.",
          confirmLabel: "Complete anyway",
          cancelLabel: "Attach now",
        },
        () => completeTrip()
      );
      return;
    }
    completeTrip();
  };

  const completeTrip = async () => {
    if (!user || !profile) return;
    setCompleting(true);
    try {
      const trimmedUlds = uldNumbers.map((u) => u.trim());
      const joinedAwb = request.awbLines.map((l) => l.awbNumber).join(",");
      const dup = await checkDuplicateUld(joinedAwb, trimmedUlds);
      if (dup.duplicate) {
        notify(
          "Duplicate ULD #",
          `ULD #${dup.uldNumber} was already logged under this AWB by ${dup.conflictingDriverName}${
            dup.conflictingDate ? ` on ${dup.conflictingDate}` : ""
          }. Double-check before completing.`
        );
        return;
      }

      const uploaded: ProofFile[] = [];
      for (const file of files) {
        uploaded.push(await uploadProofFile(file.uri, user.uid, file.name, file.kind));
      }

      const tripId = await createTrip({
        driverId: user.uid,
        driverName: profile.name,
        driverEmail: profile.email,
        date: request.tripDate,
        timeStart: formatTime(timeStart),
        timeFinish: formatTime(timeFinish),
        from: request.from,
        to: request.to,
        qty: request.awbLines.length,
        unitTypes: request.awbLines.map((l) => l.type),
        uldNumbers: trimmedUlds,
        awbNumber: joinedAwb,
        notes: `From dispatch request for ${request.customerName}.`,
        proofFiles: uploaded,
      });

      await completeTripRequest(request.id, tripId);
      setRequest((prev) => ({ ...prev, status: "completed" }));
      notify("Trip completed", "Logged and marked completed.");
      navigation.goBack();
    } catch (e: any) {
      console.error("completeTrip error:", e);
      notify("Error", `Couldn't complete the trip: ${e?.message ?? "unknown error"}`);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Trip Request</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{STATUS_LABELS[request.status]}</Text>
        </View>
      </View>
      <Text style={styles.meta}>Customer: {request.customerName}</Text>

      <TripRequestReadOnly request={request} />

      {request.status === "assigned" && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Start Trip</Text>
          )}
        </TouchableOpacity>
      )}

      {request.status === "in_progress" && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Complete Trip</Text>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Time start</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker("start")}>
                <Text style={styles.pickerText}>{formatTime(timeStart)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Time finish</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker("finish")}>
                <Text style={styles.pickerText}>{formatTime(timeFinish)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showPicker && (
            <DateTimePicker
              value={showPicker === "start" ? timeStart : timeFinish}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, selected) => {
                if (Platform.OS === "android") setShowPicker(null);
                if (!selected) return;
                if (showPicker === "start") setTimeStart(selected);
                if (showPicker === "finish") setTimeFinish(selected);
              }}
            />
          )}
          {showPicker && Platform.OS === "ios" && (
            <TouchableOpacity onPress={() => setShowPicker(null)} style={styles.doneButton}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}

          {request.awbLines.map((line, i) => (
            <View key={i}>
              <Text style={styles.label}>
                ULD # for {line.awbNumber} ({line.type})
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
            style={styles.primaryButton}
            onPress={handleComplete}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Complete Trip</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  statusBadge: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 13, color: "#666", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 10, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 16, marginBottom: 6 },
  pickerButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerText: { fontSize: 15, color: "#111" },
  doneButton: { alignSelf: "flex-end", padding: 8 },
  doneButtonText: { color: "#1d4ed8", fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
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
  primaryButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
