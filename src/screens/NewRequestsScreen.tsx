import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { Btn, dispatchStyles, TripBoardCard } from "../components/DispatchUI";
import { useDispatchData } from "../hooks/useDispatchData";
import { approveLead, dismissLead, Lead } from "../services/leads";
import { confirmAction, notify } from "../utils/alert";
import { pickupDate } from "../utils/dispatchBoard";
import { tripStage, unassignedCount } from "../utils/tripStatus";

// Everything waiting on dispatch: website leads (moved here from the old
// Dispatch screen, same approve/dismiss calls) and trips that still have an
// AWB with no driver.
export default function NewRequestsScreen({ navigation }: any) {
  const { requests, leads } = useDispatchData({ leads: true });
  const [busyId, setBusyId] = useState<string | null>(null);

  const needDriver = useMemo(
    () =>
      requests
        .filter((r) => {
          const s = tripStage(r);
          return s !== "cancelled" && s !== "invoiced" && s !== "delivered" && unassignedCount(r) > 0;
        })
        .sort((a, b) => (pickupDate(a)?.getTime() ?? 0) - (pickupDate(b)?.getTime() ?? 0)),
    [requests]
  );

  const approve = async (lead: Lead) => {
    setBusyId(lead.id);
    try {
      await approveLead(lead.id);
      notify("Lead approved", "A trip was created for the client with this email.");
    } catch (e: any) {
      notify("Couldn't approve lead", e?.message ?? "Create the client account first, then approve.");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = (lead: Lead) =>
    confirmAction({ title: "Dismiss this lead?", confirmLabel: "Dismiss", destructive: true }, async () => {
      setBusyId(lead.id);
      try {
        await dismissLead(lead.id);
      } catch (e: any) {
        notify("Couldn't dismiss lead", e?.message ?? "Try again.");
      } finally {
        setBusyId(null);
      }
    });

  return (
    <AdminShell
      navigation={navigation}
      active="NewRequests"
      title="New Requests"
      subtitle={`${needDriver.length} trip${needDriver.length === 1 ? "" : "s"} need a driver · ${leads.length} website lead${leads.length === 1 ? "" : "s"}`}
      badges={{ NewRequests: leads.length || undefined }}
      right={<Btn label="+ New trip" primary onPress={() => navigation.navigate("DispatchNewRequest")} />}
    >
      <View style={dispatchStyles.section}>
        <Text style={dispatchStyles.sectionTitle}>Need a driver</Text>
        {needDriver.length === 0 && <Text style={dispatchStyles.empty}>Every trip has a driver. 👍</Text>}
        <View style={styles.grid}>
          {needDriver.map((r) => (
            <View key={r.id} style={styles.cell}>
              <TripBoardCard
                trip={{ request: r, stage: tripStage(r), carriedOver: false, unassigned: unassignedCount(r) }}
                onPress={() => navigation.navigate("DispatchDetail", { request: r })}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={dispatchStyles.section}>
        <Text style={dispatchStyles.sectionTitle}>Website leads</Text>
        {leads.length === 0 && <Text style={dispatchStyles.empty}>No leads waiting.</Text>}
        {leads.map((lead) => (
          <View key={lead.id} style={styles.lead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.leadName}>{lead.contactName}</Text>
              <Text style={styles.leadMeta}>
                {lead.email} · {lead.from} → {lead.to}
                {lead.tripDate ? ` · ${lead.tripDate}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => approve(lead)} disabled={busyId === lead.id}>
              <Text style={styles.approve}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => dismiss(lead)} disabled={busyId === lead.id}>
              <Text style={styles.dismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: 280, maxWidth: "100%" },
  lead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 10,
  },
  leadName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  leadMeta: { fontSize: 12.5, color: "#64748b", marginTop: 2 },
  approve: { color: "#1d4ed8", fontWeight: "800" },
  dismiss: { color: "#b91c1c", fontWeight: "700" },
});
