import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateField from "../components/DateField";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import { useAuth } from "../context/AuthContext";
import { syncBadgeCount } from "../services/notifications";
import { uploadProofFile } from "../services/storage";
import { checkDuplicateUld, createTrip } from "../services/trips";
import {
  completeMyAwbLines,
  startMyAwbLines,
  updateMyLiveLocation,
} from "../services/tripRequests";
import { computeTripRequestRollup, ProofFile, TripRequest, TripRequestStatus } from "../types";
import { confirmAction, notify } from "../utils/alert";
import {
  ensureAlwaysLocationPermission,
  promptToAllowAlwaysLocation,
  startBackgroundLocationSharing,
} from "../services/backgroundLocation";

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

  // Only this driver's own AWB lines are relevant here — a trip request can
  // have other lines assigned to other drivers, at a completely different
  // stage, which this screen never shows or acts on.
  const myLines = request.awbLines.filter((l) => l.assignedDriverId === user?.uid);
  const myAssignedLines = myLines.filter((l) => l.status === "assigned");
  // Keep the original awbLines index alongside each line — a driver can run
  // several in-progress AWBs as separate physical trips, so completion needs
  // to target specific lines rather than always all of them, and the index
  // is what identifies a line to completeMyAwbLines.
  const myInProgressEntries = request.awbLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.assignedDriverId === user?.uid && line.status === "in_progress");
  const myStatus = computeTripRequestRollup(myLines).status;
  const isSharingLocation = Platform.OS !== "web" && myInProgressEntries.length > 0;
  const [locationDenied, setLocationDenied] = useState(false);

  const promptToEnableLocation = promptToAllowAlwaysLocation;

  // Hands this request to the background location task, which keeps pinging
  // the driver's position every ~25s even with the phone locked. The task
  // stops itself once the server says no line is in progress anymore.
  useEffect(() => {
    if (!isSharingLocation || !user) return;
    let cancelled = false;
    (async () => {
      const result = await ensureAlwaysLocationPermission();
      if (cancelled) return;
      if (result !== "granted") {
        setLocationDenied(true);
        promptToEnableLocation();
        return;
      }
      setLocationDenied(false);
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          await updateMyLiveLocation(request.id, pos.coords.latitude, pos.coords.longitude);
        }
      } catch (err) {
        console.error("Failed to share location:", err);
      }
      await startBackgroundLocationSharing(request.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSharingLocation, request.id, user]);

  const [timeStart, setTimeStart] = useState(new Date());
  const [timeFinish, setTimeFinish] = useState(new Date());
  // Keyed by the AWB line's index (not position in myInProgressEntries, which
  // shifts as lines complete) so selection survives across re-renders.
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [uldByIndex, setUldByIndex] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showNoteField, setShowNoteField] = useState(false);
  const [driverNote, setDriverNote] = useState("");
  const [completing, setCompleting] = useState(false);

  // Newly in-progress lines default to selected (matches the old
  // all-at-once behavior); a line the driver already unchecked stays
  // unchecked even if this effect re-runs for an unrelated reason, since it
  // only fires when the actual set of in-progress indexes changes.
  const seenIndexesRef = useRef<Set<number>>(new Set());
  const inProgressIndexKey = myInProgressEntries.map((e) => e.index).join(",");
  useEffect(() => {
    const currentIdx = myInProgressEntries.map((e) => e.index);
    setSelectedIndexes((prev) => {
      const next = new Set<number>();
      currentIdx.forEach((i) => {
        if (prev.has(i) || !seenIndexesRef.current.has(i)) next.add(i);
      });
      return next;
    });
    setUldByIndex((prev) => {
      const next: Record<number, string> = {};
      currentIdx.forEach((i) => {
        next[i] = prev[i] ?? "";
      });
      return next;
    });
    seenIndexesRef.current = new Set(currentIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgressIndexKey]);

  const toggleSelected = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedEntries = myInProgressEntries.filter((e) => selectedIndexes.has(e.index));

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
        if (!user) return;
        // Drivers must share location "Always" before they can start a trip.
        if (Platform.OS !== "web") {
          const loc = await ensureAlwaysLocationPermission();
          if (loc !== "granted") {
            promptToAllowAlwaysLocation();
            return;
          }
        }
        setStarting(true);
        try {
          await startMyAwbLines(request.id);
          setRequest((prev) => ({
            ...prev,
            awbLines: prev.awbLines.map((l) =>
              l.assignedDriverId === user.uid && l.status === "assigned"
                ? { ...l, status: "in_progress" as const }
                : l
            ),
          }));
          syncBadgeCount(user.uid);
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
    if (selectedEntries.length === 0) {
      notify("Select an AWB", "Check at least one AWB to mark completed on this trip.");
      return;
    }
    if (selectedEntries.some(({ index }) => !uldByIndex[index]?.trim())) {
      notify("Missing info", "Enter the ULD # for each checked AWB.");
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
      const trimmedUlds = selectedEntries.map(({ index }) => uldByIndex[index]?.trim() ?? "");
      const joinedAwb = selectedEntries.map(({ line }) => line.awbNumber).join(",");
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
        qty: selectedEntries.length,
        unitTypes: selectedEntries.map(({ line }) => line.type),
        uldNumbers: trimmedUlds,
        awbNumber: joinedAwb,
        kilograms: selectedEntries.reduce((sum, { line }) => sum + line.kilograms, 0),
        notes: driverNote.trim()
          ? `From dispatch request for ${request.customerName}. Driver note: ${driverNote.trim()}`
          : `From dispatch request for ${request.customerName}.`,
        proofFiles: uploaded,
      });

      const completedIndexes = selectedEntries.map(({ index }) => index);
      await completeMyAwbLines(request.id, tripId, completedIndexes);
      setRequest((prev) => ({
        ...prev,
        awbLines: prev.awbLines.map((l, i) =>
          completedIndexes.includes(i)
            ? { ...l, status: "completed" as const, tripLogId: tripId }
            : l
        ),
      }));
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
          <Text style={styles.statusBadgeText}>{STATUS_LABELS[myStatus]}</Text>
        </View>
      </View>
      <Text style={styles.meta}>Customer: {request.customerName}</Text>

      <TripRequestReadOnly request={request} />

      {myAssignedLines.length > 0 && (
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

      {myInProgressEntries.length > 0 && (
        <View style={{ marginTop: 10 }}>
          {isSharingLocation && locationDenied && (
            <TouchableOpacity style={styles.locationDeniedBanner} onPress={promptToEnableLocation}>
              <Text style={styles.locationDeniedText}>
                📍 Location must be set to “Always” — tap to open Settings so dispatch and the customer can track this trip
              </Text>
            </TouchableOpacity>
          )}
          <Text style={styles.sectionTitle}>Complete Trip</Text>

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

          <Text style={styles.label}>
            {myInProgressEntries.length > 1
              ? "Which AWBs did you complete on this trip?"
              : "AWB for this trip"}
          </Text>
          {myInProgressEntries.map(({ line, index }) => {
            const checked = selectedIndexes.has(index);
            return (
              <View key={index} style={styles.awbCheckCard}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => toggleSelected(index)}
                  disabled={myInProgressEntries.length === 1}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    {line.awbNumber} ({line.type})
                    {line.priority && line.priority !== "Normal"
                      ? line.priority === "High"
                        ? " · High priority !"
                        : ` · ${line.priority} priority`
                      : ""}
                  </Text>
                </TouchableOpacity>
                {checked && (
                  <>
                    <Text style={styles.label}>ULD #</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. AKE12345AA"
                      value={uldByIndex[index] ?? ""}
                      onChangeText={(v) => setUldByIndex((prev) => ({ ...prev, [index]: v }))}
                      autoCapitalize="characters"
                    />
                  </>
                )}
              </View>
            );
          })}

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

          {showNoteField ? (
            <>
              <Text style={styles.label}>Note</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Anything dispatch should know about this trip"
                value={driverNote}
                onChangeText={setDriverNote}
                multiline
                autoFocus
              />
            </>
          ) : (
            <TouchableOpacity onPress={() => setShowNoteField(true)} style={styles.addNoteLink}>
              <Text style={styles.addNoteLinkText}>+ Add a note</Text>
            </TouchableOpacity>
          )}

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
  awbCheckCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  checkboxMark: { color: "#fff", fontSize: 13, fontWeight: "800" },
  checkboxLabel: { fontSize: 14, fontWeight: "700", color: "#111" },
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
  locationDeniedBanner: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  locationDeniedText: { fontSize: 12, color: "#c0392b", fontWeight: "600" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 16, marginBottom: 6 },
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
  addNoteLink: { marginTop: 14, alignSelf: "flex-start" },
  addNoteLinkText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
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
