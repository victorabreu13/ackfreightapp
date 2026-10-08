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
import LiveMap from "../components/LiveMap";
import SignaturePad, { strokesToSvg, SignatureStrokes } from "../components/SignaturePad";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import { ensureAlwaysLocationPermission, promptToAllowAlwaysLocation } from "../utils/locationPermission";
import { useAuth } from "../context/AuthContext";
import { subscribeToDriverAwbPay } from "../services/driverPay";
import { syncBadgeCount } from "../services/notifications";
import { uploadProofFile, uploadProofSvg } from "../services/storage";
import { checkDuplicateUld, createTrip, duplicateUldMessage } from "../services/trips";
import {
  acceptAssignedAwb,
  completeMyAwbLines,
  declineAwbLine,
  markAwbPickedUp,
  startMyAwbLines,
  subscribeToTripRequest,
} from "../services/tripRequests";
import { AwbPay, computeTripRequestRollup, LatLng, ProofFile, TripRequest, TripRequestStatus } from "../types";
import { confirmAction, notify } from "../utils/alert";
import { money, NavigationApp, navigationTargets, payHeadline, routeSummary } from "../utils/driverPayDisplay";

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

async function openDirections(app: NavigationApp, address: string) {
  const target = navigationTargets(address)[app];
  try {
    const canOpen = await Linking.canOpenURL(target.appUrl);
    await Linking.openURL(canOpen ? target.appUrl : target.webUrl);
  } catch {
    await Linking.openURL(target.webUrl);
  }
}

function pinOf(point?: LatLng | null): LatLng | null {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return null;
  return point;
}

function TripOffer({
  request,
  pays,
  driverId,
}: {
  request: TripRequest;
  pays: AwbPay[];
  driverId?: string;
}) {
  const mine = request.awbLines.filter((line) => line.assignedDriverId === driverId);
  const beforePickup =
    mine.length === 0 ||
    mine.some((line) => line.status === "assigned" || line.status === "accepted" || line.status === "in_progress");
  const address = beforePickup ? request.from : request.to;
  const route = request.routeEstimate;
  const sample = pays[0];
  const drive = routeSummary(
    route?.miles ?? sample?.miles,
    route?.driveMinutes ?? sample?.driveMinutes,
    route?.approximate ?? sample?.milesApproximate
  );
  const pin = pinOf(route?.destination) || pinOf(route?.origin) || pinOf(sample?.destination) || pinOf(sample?.origin);
  const quoted = pays.filter((pay) => pay.status === "quoted" && typeof pay.amount === "number");

  return (
    <View style={styles.offerCard}>
      {quoted.length === 0 ? (
        <Text style={styles.offerUnset}>Pay set by dispatch</Text>
      ) : (
        quoted.map((pay) => (
          <View key={pay.awbIndex} style={{ marginBottom: 8 }}>
            <Text style={styles.offerAmount}>{money(pay.amount as number)}</Text>
            <Text style={styles.meta}>{pay.awbNumber || "AWB"}</Text>
            {pay.breakdown.map((part) => (
              <Text key={part.label} style={styles.meta}>
                {part.label} · {money(part.amount)}
              </Text>
            ))}
            {pay.locked && pay.waitAmount > 0 && <Text style={styles.meta}>Wait · {money(pay.waitAmount)}</Text>}
            {pay.adjustment && (
              <Text style={styles.meta}>
                Adjustment · {money(pay.adjustment.amount)} ({pay.adjustment.reason})
              </Text>
            )}
          </View>
        ))
      )}
      {!!drive && <Text style={styles.meta}>{drive}</Text>}
      {!!request.pickupTime && <Text style={styles.meta}>Pickup window {request.pickupTime}</Text>}
      {pin && <View style={{ marginTop: 10 }}><LiveMap lat={pin.lat} lng={pin.lng} label={address} /></View>}
      {!!address && (
        <View style={styles.row}>
          <TouchableOpacity style={styles.attachButton} onPress={() => openDirections("apple", address)}>
            <Text style={styles.attachButtonText}>Apple Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={() => openDirections("google", address)}>
            <Text style={styles.attachButtonText}>Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={() => openDirections("waze", address)}>
            <Text style={styles.attachButtonText}>Waze</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function DriverTripRequestDetailScreen({ route, navigation }: any) {
  const { user, profile } = useAuth();
  const initialRequest: TripRequest = route.params.request;
  const [request, setRequest] = useState(initialRequest);
  const [starting, setStarting] = useState(false);
  const [actingIndex, setActingIndex] = useState<number | null>(null);
  const [pickingUp, setPickingUp] = useState(false);
  const [signature, setSignature] = useState<SignatureStrokes>([]);
  const [signing, setSigning] = useState(false);
  const [payByIndex, setPayByIndex] = useState<Record<number, AwbPay>>({});

  useEffect(() => {
    if (!user) return;
    return subscribeToDriverAwbPay(user.uid, (rows) => {
      const next: Record<number, AwbPay> = {};
      rows
        .filter((row) => row.requestId === initialRequest.id)
        .forEach((row) => {
          next[row.awbIndex] = row;
        });
      setPayByIndex(next);
    });
  }, [user, initialRequest.id]);

  useEffect(() => {
    return subscribeToTripRequest(
      initialRequest.id,
      setRequest,
      (err) => console.error("subscribeToTripRequest error:", err)
    );
  }, [initialRequest.id]);

  // Only this driver's own AWB lines are relevant here — a trip request can
  // have other lines assigned to other drivers, at a completely different
  // stage, which this screen never shows or acts on.
  const myLines = request.awbLines.filter((l) => l.assignedDriverId === user?.uid);
  const myPendingEntries = request.awbLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.assignedDriverId === user?.uid && line.status === "assigned");
  const myAcceptedLines = myLines.filter((l) => l.status === "accepted");
  // Accept is optional: a line dispatch assigned (not yet accepted) can be started directly.
  const myStartableLines = myLines.filter((l) => l.status === "accepted" || l.status === "assigned");
  // Completion targets picked-up lines. Start is only available after accept.
  const myStartedEntries = request.awbLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.assignedDriverId === user?.uid && line.status === "in_progress");
  const myPickedUpEntries = request.awbLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.assignedDriverId === user?.uid && line.status === "picked_up");
  const myStatus = computeTripRequestRollup(myLines).status;
  const isSharingLocation =
    Platform.OS !== "web" && (myStartedEntries.length > 0 || myPickedUpEntries.length > 0);
  const [locationDenied, setLocationDenied] = useState(false);

  const promptToEnableLocation = () => {
    confirmAction(
      {
        title: "Location sharing is off",
        message:
          "Dispatch and the customer can't see this trip on the map without it. Turn it on in Settings.",
        confirmLabel: "Open Settings",
        cancelLabel: "Not now",
      },
      () => Linking.openSettings()
    );
  };

  // Location pings are owned by DriverLocationPublisher so they continue
  // after this screen closes. This only surfaces a denied-permission banner.
  useEffect(() => {
    if (!isSharingLocation) return;
    let cancelled = false;
    (async () => {
      const current = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (current.status === "granted") {
        setLocationDenied(false);
        return;
      }
      const asked = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (asked.status !== "granted") {
        setLocationDenied(true);
        promptToEnableLocation();
      } else {
        setLocationDenied(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSharingLocation]);

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
  const inProgressIndexKey = myPickedUpEntries.map((e) => e.index).join(",");
  useEffect(() => {
    const currentIdx = myPickedUpEntries.map((e) => e.index);
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

  const selectedEntries = myPickedUpEntries.filter((e) => selectedIndexes.has(e.index));

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

  const handleAccept = async (index: number) => {
    if (!user) return;
    setActingIndex(index);
    try {
      await acceptAssignedAwb(request.id, index);
      setRequest((prev) => ({
        ...prev,
        awbLines: prev.awbLines.map((line, i) =>
          i === index ? { ...line, status: "accepted" as const, acceptedAt: Date.now() } : line
        ),
      }));
    } catch (e: any) {
      notify("Couldn't accept", e?.message ?? "Try again.");
    } finally {
      setActingIndex(null);
    }
  };

  const handleDecline = (index: number, awbNumber: string) => {
    confirmAction(
      {
        title: "Decline this AWB?",
        message: `${awbNumber} goes back to the board and dispatch is notified.`,
        confirmLabel: "Decline",
        destructive: true,
      },
      async () => {
        if (!user) return;
        setActingIndex(index);
        try {
          await declineAwbLine(request.id, index);
          setRequest((prev) => ({
            ...prev,
            awbLines: prev.awbLines.map((line, i) =>
              i === index
                ? {
                    ...line,
                    status: "submitted" as const,
                    assignedDriverId: null,
                    assignedDriverName: null,
                    acceptedAt: undefined,
                  }
                : line
            ),
          }));
          syncBadgeCount(user.uid);
        } catch (e: any) {
          notify("Couldn't decline", e?.message ?? "Try again.");
        } finally {
          setActingIndex(null);
        }
      }
    );
  };

  const handleStart = () => {
    if (myStartableLines.length === 0) return;
    confirmAction(
      { title: "Start this trip?", confirmLabel: "Start Trip" },
      async () => {
        if (!user) return;
        // Drivers must share location "Always" before they can start a trip.
        if (!(await ensureAlwaysLocationPermission())) {
          promptToAllowAlwaysLocation();
          return;
        }
        setStarting(true);
        try {
          await startMyAwbLines(request.id);
          setRequest((prev) => ({
            ...prev,
            awbLines: prev.awbLines.map((l) =>
              l.assignedDriverId === user.uid && (l.status === "accepted" || l.status === "assigned")
                ? { ...l, status: "in_progress" as const, startedAt: Date.now() }
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

  const handlePickup = () => {
    const indexes = myStartedEntries.map((entry) => entry.index);
    if (indexes.length === 0) return;
    confirmAction(
      { title: "Mark freight picked up?", confirmLabel: "Picked up" },
      async () => {
        setPickingUp(true);
        try {
          await markAwbPickedUp(request.id, indexes);
          setRequest((prev) => ({
            ...prev,
            awbLines: prev.awbLines.map((line, i) =>
              indexes.includes(i) ? { ...line, status: "picked_up" as const, pickedUpAt: Date.now() } : line
            ),
          }));
        } catch (e: any) {
          notify("Couldn't mark picked up", e?.message ?? "Try again.");
        } finally {
          setPickingUp(false);
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
    if (signature.length === 0 || signature.every((stroke) => stroke.length === 0)) {
      notify("Signature required", "Have the receiver sign before completing this delivery.");
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
        notify("Duplicate ULD #", duplicateUldMessage(dup.uldNumber, "completing"));
        return;
      }

      const uploaded: ProofFile[] = [];
      for (const file of files) {
        uploaded.push(await uploadProofFile(file.uri, user.uid, file.name, file.kind));
      }
      const signatureFile = await uploadProofSvg(
        strokesToSvg(signature),
        user.uid,
        "signature.svg"
      );

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
        signature: signatureFile,
        signatureStrokes: signature,
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }} scrollEnabled={!signing}>
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
      <Text style={styles.steps}>Start → Picked up → Delivered</Text>

      <TripOffer request={request} pays={Object.values(payByIndex)} driverId={user?.uid} />

      <TripRequestReadOnly request={request} showQuote={false} onlyDriverId={user?.uid} />

      {myPendingEntries.map(({ line, index }) => {
        const offer = payHeadline(payByIndex[index]);
        return (
        <View key={`pending-${index}`} style={styles.awbCheckCard}>
          <Text style={[styles.offerAmount, !offer.quoted && styles.offerUnset]}>{offer.text}</Text>
          <Text style={styles.checkboxLabel}>
            {line.awbNumber} is assigned to you
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.attachButton, { marginTop: 12 }, !offer.quoted && styles.primaryButtonDisabled]}
              onPress={() => handleAccept(index)}
              disabled={actingIndex === index || !offer.quoted}
            >
              <Text style={styles.attachButtonText}>{offer.quoted ? "Accept" : "Waiting on dispatch"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachButton, { marginTop: 12 }]}
              onPress={() => handleDecline(index, line.awbNumber)}
              disabled={actingIndex === index}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
        );
      })}

      {request.awbLines.map((line, index) =>
        line.assignedDriverId === user?.uid && line.status === "accepted" ? (
          <View key={`accepted-${index}`} style={styles.awbCheckCard}>
            <Text style={styles.checkboxLabel}>{line.awbNumber} accepted</Text>
            <TouchableOpacity onPress={() => handleDecline(index, line.awbNumber)}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : null
      )}

      {myStartableLines.length > 0 && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Start Trip
            </Text>
          )}
        </TouchableOpacity>
      )}

      {myStartedEntries.length > 0 && (
        <TouchableOpacity style={styles.primaryButton} onPress={handlePickup} disabled={pickingUp}>
          {pickingUp ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Picked up</Text>
          )}
        </TouchableOpacity>
      )}

      {isSharingLocation && locationDenied && (
        <TouchableOpacity style={styles.locationDeniedBanner} onPress={promptToEnableLocation}>
          <Text style={styles.locationDeniedText}>
            📍 Location sharing is off — tap to turn it on so dispatch and the customer can track this trip
          </Text>
        </TouchableOpacity>
      )}

      {myPickedUpEntries.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Deliver</Text>

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
            {myPickedUpEntries.length > 1
              ? "Which AWBs did you deliver on this trip?"
              : "AWB for this delivery"}
          </Text>
          {myPickedUpEntries.map(({ line, index }) => {
            const checked = selectedIndexes.has(index);
            return (
              <View key={index} style={styles.awbCheckCard}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => toggleSelected(index)}
                  disabled={myPickedUpEntries.length === 1}
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

          <Text style={styles.label}>Receiver signature</Text>
          <SignaturePad strokes={signature} onChange={setSignature} onDrawingChange={setSigning} />

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
    marginBottom: 12,
  },
  primaryButtonDisabled: { backgroundColor: "#94a3b8" },
  steps: { fontSize: 13, color: "#666", marginTop: 6 },
  offerCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 14 },
  offerAmount: { fontSize: 32, fontWeight: "800", color: "#111" },
  offerUnset: { fontSize: 18, fontWeight: "800", color: "#92400e" },
  declineText: { color: "#c0392b", fontWeight: "700", fontSize: 13, marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
