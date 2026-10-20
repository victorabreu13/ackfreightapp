import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SendToCounterModal from "./SendToCounterModal";
import { mergeRequestDocuments, updateAwbDocument, zipRequestDocuments } from "../services/tripRequests";
import { uploadTripRequestFile } from "../services/storage";
import { notify } from "../utils/alert";
import LiveTrackingSection from "./LiveTrackingSection";
import { AwbLineStatus, AwbPriority, TripRequest } from "../types";
import { formatQuote } from "../utils/quote";

const LINE_STATUS_LABELS: Record<AwbLineStatus, string> = {
  submitted: "On the board",
  assigned: "Assigned — waiting for the driver",
  accepted: "Accepted",
  in_progress: "Started",
  picked_up: "Picked up",
  completed: "Completed",
};

const PRIORITY_COLORS: Record<AwbPriority, { bg: string; text: string }> = {
  Low: { bg: "#f0f0f0", text: "#666" },
  Normal: { bg: "#e8edff", text: "#1d4ed8" },
  High: { bg: "#fdecea", text: "#c0392b" },
};

// onlyDriverId: on the driver side, show just the AWBs assigned to that driver
// — a request can split its AWBs across several drivers.
export default function TripRequestReadOnly({
  request,
  showQuote = true,
  onlyDriverId,
  editableDocs = false,
  canPrint = false,
}: {
  request: TripRequest;
  showQuote?: boolean;
  onlyDriverId?: string;
  /** Admin / owning customer can add or replace each AWB's documents. */
  editableDocs?: boolean;
  /** Admins: print all or the picked documents as one PDF. */
  canPrint?: boolean;
}) {
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [counterKeys, setCounterKeys] = useState<string[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Every document on the AWBs this viewer can see, keyed by "<index in request>-<slot>".
  const visibleLines = onlyDriverId
    ? request.awbLines.filter((l) => l.assignedDriverId === onlyDriverId)
    : request.awbLines;
  const feeKeys = request.importFeeFiles.map((_, i) => `${i}-fee`);
  const lineDocKeys = visibleLines.flatMap((line) => {
    const idx = request.awbLines.indexOf(line);
    return (["awb", "loa", "do"] as const)
      .filter((slot) => !!(slot === "awb" ? line.awbFile : slot === "loa" ? line.loaFile : line.doFile))
      .map((slot) => `${idx}-${slot}`);
  });
  // Import fee (1F) files belong to the whole request, so they print / download / send with the AWBs.
  const allDocKeys = [...lineDocKeys, ...feeKeys];
  const togglePicked = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const printDocs = async (keys: string[]) => {
    // Open the tab now, inside the click, so the browser doesn't block it; the
    // PDF's link only exists after the server has built it.
    const tab = Platform.OS === "web" ? window.open("", "_blank") : null;
    setZipping(true);
    try {
      const items = keys.map((k) => {
        const [i, slot] = k.split("-");
        return { awbIndex: Number(i), slot: slot as "awb" | "loa" | "do" | "fee" };
      });
      const { url, skipped } = await mergeRequestDocuments(request.id, items);
      if (tab) tab.location.href = url;
      else Linking.openURL(url);
      if (skipped > 0) {
        notify(
          "Some files were left out",
          `${skipped} file${skipped === 1 ? "" : "s"} couldn't be printed from here (only PDF, JPG and PNG). Use Download for those.`
        );
      }
    } catch (e: any) {
      if (tab) tab.close();
      notify("Couldn't prepare the print", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setZipping(false);
    }
  };
  const downloadDocs = async (keys: string[]) => {
    setZipping(true);
    try {
      const items = keys.map((k) => {
        const [i, slot] = k.split("-");
        return { awbIndex: Number(i), slot: slot as "awb" | "loa" | "do" | "fee" };
      });
      const { url } = await zipRequestDocuments(request.id, items);
      Linking.openURL(url);
    } catch (e: any) {
      notify("Couldn't prepare the download", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setZipping(false);
    }
  };

  const changeDoc = async (awbIndex: number, slot: "awb" | "loa" | "do" | "fee") => {
    const busyKey = `${awbIndex}-${slot}`;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setBusyDoc(busyKey);
      const uploaded = await uploadTripRequestFile(
        asset.uri,
        request.customerId,
        request.id,
        `${slot}-${awbIndex}`,
        asset.name
      );
      await updateAwbDocument(request.id, awbIndex, slot, uploaded);
    } catch (e: any) {
      notify("Couldn't save the document", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusyDoc(null);
    }
  };

  const awbLines = onlyDriverId
    ? request.awbLines.filter((l) => l.assignedDriverId === onlyDriverId)
    : request.awbLines;
  const noneSelected = picked.size === 0;
  const menuActions: { label: string; disabled?: boolean; keepOpen?: boolean; run: () => void }[] = [
    {
      label: picked.size === allDocKeys.length ? "Clear selection" : "Select all documents",
      keepOpen: true,
      run: () => setPicked(picked.size === allDocKeys.length ? new Set() : new Set(allDocKeys)),
    },
    { label: `Download selected (${picked.size})`, disabled: noneSelected, run: () => downloadDocs([...picked]) },
    { label: `Download all (${allDocKeys.length})`, run: () => downloadDocs(allDocKeys) },
    ...(canPrint
      ? [
          { label: `Print selected (${picked.size})`, disabled: noneSelected, run: () => printDocs([...picked]) },
          { label: `Print all (${allDocKeys.length})`, run: () => printDocs(allDocKeys) },
          { label: `Send selected to counter (${picked.size})`, disabled: noneSelected, run: () => setCounterKeys([...picked]) },
          { label: `Send all to counter (${allDocKeys.length})`, run: () => setCounterKeys(allDocKeys) },
        ]
      : []),
  ];

  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Route</Text>
        <Text style={styles.sectionValue}>
          {request.from} → {request.to} · {request.tripDate}
        </Text>
      </View>
      {!!request.pickupTime && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pick up time</Text>
          <Text style={styles.sectionValue}>{request.pickupTime}</Text>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Person requesting</Text>
        <Text style={styles.sectionValue}>{request.personRequesting}</Text>
      </View>
      {!!request.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Note</Text>
          <Text style={styles.sectionValue}>{request.notes}</Text>
        </View>
      )}
      {showQuote && request.quoteStatus != null && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Quote</Text>
          <Text style={styles.sectionValue}>{formatQuote(request)}</Text>
        </View>
      )}

      <LiveTrackingSection request={request} />

      {canPrint && <SendToCounterModal request={request} keys={counterKeys} onClose={() => setCounterKeys(null)} />}
      <Text style={styles.sectionTitle}>AWBs</Text>
      {allDocKeys.length > 0 && (
        <View style={styles.downloadBar}>
          <Text style={styles.selectedCount}>
            {picked.size > 0 ? `${picked.size} of ${allDocKeys.length} selected` : `${allDocKeys.length} document${allDocKeys.length === 1 ? "" : "s"}`}
          </Text>
          {zipping ? (
            <ActivityIndicator size="small" color="#1d4ed8" />
          ) : (
            <TouchableOpacity style={styles.downloadButton} onPress={() => setMenuOpen(true)}>
              <Text style={styles.downloadButtonText}>More actions ▾</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>Documents</Text>
            {menuActions.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={styles.menuItem}
                disabled={a.disabled}
                onPress={() => {
                  if (!a.keepOpen) setMenuOpen(false);
                  a.run();
                }}
              >
                <Text style={[styles.menuItemText, a.disabled && styles.menuItemOff]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.menuClose} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {canPrint && (request.counterSends ?? []).length > 0 && (
        <Text style={styles.sentNote}>
          Last sent to {request.counterSends![request.counterSends!.length - 1].email} on{" "}
          {new Date(request.counterSends![request.counterSends!.length - 1].sentAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {request.counterSends!.length > 1 ? ` · ${request.counterSends!.length} sends in total` : ""}
        </Text>
      )}
      {awbLines.map((line, i) => {
        const priority = line.priority ?? "Normal";
        return (
        <View key={i} style={styles.awbCard}>
          <View style={styles.awbTitleRow}>
            <Text style={styles.awbTitle}>
              {line.awbNumber} · {line.type} · {line.qtyPieces} pcs · {line.kilograms} kg
            </Text>
            {priority !== "Normal" && (
              <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[priority].bg }]}>
                <Text style={[styles.priorityBadgeText, { color: PRIORITY_COLORS[priority].text }]}>
                  {priority === "High" ? "High !" : priority}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.awbAssignment}>
            {line.assignedDriverName ? `Driver: ${line.assignedDriverName}` : "Unassigned"}
            {" · "}
            {LINE_STATUS_LABELS[line.status] ?? line.status}
          </Text>
          {(line.lengthIn || line.widthIn || line.heightIn) && (
            <Text style={styles.awbAssignment}>
              {line.lengthIn ?? "–"} × {line.widthIn ?? "–"} × {line.heightIn ?? "–"} in
            </Text>
          )}
          {line.hazmat && (
            <Text style={styles.hazmat}>
              HAZMAT{line.unNumber ? ` · UN ${line.unNumber}` : ""}
              {line.hazmatClass ? ` · class ${line.hazmatClass}` : ""}
            </Text>
          )}
          {(
            [
              ["AWB document", line.awbFile, "awb"],
              ["Letter of Authorization", line.loaFile, "loa"],
              ["Delivery Order / Ticket", line.doFile, "do"],
            ] as const
          ).map(([label, file, slot]) => {
            // Rows keep their index in the full request, not the filtered list.
            const realIndex = request.awbLines.indexOf(line);
            const busy = busyDoc === `${realIndex}-${slot}`;
            if (!file && !editableDocs) return null;
            return (
              <View key={label} style={styles.docRow}>
                {file && (
                  <TouchableOpacity onPress={() => togglePicked(`${realIndex}-${slot}`)} accessibilityLabel={`Select ${label}`}>
                    <Text style={styles.docCheck}>{picked.has(`${realIndex}-${slot}`) ? "☑" : "☐"}</Text>
                  </TouchableOpacity>
                )}
                {file ? (
                  <TouchableOpacity style={styles.docMain} onPress={() => Linking.openURL(file.url)}>
                    <Text style={styles.docName} numberOfLines={1}>
                      📄 {label}: {file.name}
                    </Text>
                    <Text style={styles.docOpen}>Open</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.docMissing} numberOfLines={1}>
                    {label}: not uploaded
                  </Text>
                )}
                {editableDocs &&
                  (busy ? (
                    <ActivityIndicator size="small" color="#1d4ed8" />
                  ) : (
                    <TouchableOpacity onPress={() => changeDoc(realIndex, slot)}>
                      <Text style={styles.docChange}>{file ? "Replace" : "Upload"}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            );
          })}
        </View>
        );
      })}

      {(request.importFeeFiles.length > 0 || editableDocs) && (
        <>
          <Text style={styles.sectionTitle}>Import Fee / 1F</Text>
          {request.importFeeFiles.map((file, i) => (
            <View key={i} style={styles.docRow}>
              <TouchableOpacity onPress={() => togglePicked(`${i}-fee`)} accessibilityLabel={`Select ${file.name}`}>
                <Text style={styles.docCheck}>{picked.has(`${i}-fee`) ? "☑" : "☐"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.docMain} onPress={() => Linking.openURL(file.url)}>
                <Text style={styles.docName} numberOfLines={1}>
                  📄 {file.name}
                </Text>
                <Text style={styles.docOpen}>Open</Text>
              </TouchableOpacity>
              {editableDocs &&
                (busyDoc === `${i}-fee` ? (
                  <ActivityIndicator size="small" color="#1d4ed8" />
                ) : (
                  <TouchableOpacity onPress={() => changeDoc(i, "fee")}>
                    <Text style={styles.docChange}>Replace</Text>
                  </TouchableOpacity>
                ))}
            </View>
          ))}
          {editableDocs && (
            <View style={styles.docRow}>
              <Text style={styles.docMissing}>
                {request.importFeeFiles.length === 0 ? "No import fee file yet" : "Need another file?"}
              </Text>
              {busyDoc === `${request.importFeeFiles.length}-fee` ? (
                <ActivityIndicator size="small" color="#1d4ed8" />
              ) : (
                <TouchableOpacity onPress={() => changeDoc(request.importFeeFiles.length, "fee")}>
                  <Text style={styles.docChange}>Upload</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  sectionValue: { fontSize: 16, color: "#111", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  awbCard: { backgroundColor: "#f0f2fa", borderRadius: 12, padding: 14, marginBottom: 12 },
  awbTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  awbTitle: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 2, flex: 1, marginRight: 8 },
  priorityBadge: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  priorityBadgeText: { fontSize: 11, fontWeight: "800" },
  awbAssignment: { fontSize: 12, color: "#666", marginBottom: 2 },
  hazmat: { fontSize: 12, fontWeight: "800", color: "#c0392b", marginBottom: 6 },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  docMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  docCheck: { fontSize: 20, color: "#1d4ed8", marginRight: 10 },
  sentNote: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  selectedCount: { fontSize: 13, color: "#475569", fontWeight: "600" },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  menuBox: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 8, width: "100%", maxWidth: 380 },
  menuTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", paddingHorizontal: 18, paddingVertical: 8 },
  menuItem: { paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  menuItemText: { fontSize: 15.5, fontWeight: "600", color: "#0f172a" },
  menuItemOff: { color: "#cbd5e1" },
  menuClose: { paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  menuCloseText: { fontSize: 15.5, fontWeight: "700", color: "#64748b" },
  downloadBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  downloadButtons: { flexDirection: "row", gap: 8, alignItems: "center" },
  downloadButton: { backgroundColor: "#e8edff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  downloadButtonOff: { opacity: 0.5 },
  downloadButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  docMissing: { flex: 1, color: "#94a3b8", marginRight: 8 },
  docChange: { color: "#1d4ed8", fontWeight: "700", marginLeft: 12 },
  docName: { flex: 1, color: "#333", marginRight: 8 },
  docOpen: { color: "#1d4ed8", fontWeight: "700" },
});
