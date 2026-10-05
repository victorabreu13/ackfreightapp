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
import {
  getCompanyPayDefault,
  getDriverPayAgreement,
  setCompanyPayDefault,
  setDriverPayAgreement,
} from "../services/driverPay";
import { PayAgreement, PayAgreementLog } from "../types";
import { notify } from "../utils/alert";

type FormState = {
  percentOfQuote: string;
  flatUld: string;
  flatSkid: string;
  flatAirport: string;
  base: string;
  perMile: string;
  perUld: string;
  perSkid: string;
  waitFreeMinutes: string;
  waitPer15Min: string;
  hazmat: string;
  afterHours: string;
  afterHoursStart: string;
  afterHoursEnd: string;
};

function emptyForm(): FormState {
  return {
    percentOfQuote: "",
    flatUld: "",
    flatSkid: "",
    flatAirport: "",
    base: "",
    perMile: "",
    perUld: "",
    perSkid: "",
    waitFreeMinutes: "",
    waitPer15Min: "",
    hazmat: "",
    afterHours: "",
    afterHoursStart: "",
    afterHoursEnd: "",
  };
}

function showRate(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function agreementToForm(agreement: PayAgreement): FormState {
  return {
    percentOfQuote: showRate(agreement.percentOfQuote),
    flatUld: showRate(agreement.flatByType?.uld),
    flatSkid: showRate(agreement.flatByType?.skid),
    flatAirport: showRate(agreement.flatByType?.airport),
    base: showRate(agreement.base),
    perMile: showRate(agreement.perMile),
    perUld: showRate(agreement.perUld),
    perSkid: showRate(agreement.perSkid),
    waitFreeMinutes: showRate(agreement.extras?.waitFreeMinutes),
    waitPer15Min: showRate(agreement.extras?.waitPer15Min),
    hazmat: showRate(agreement.extras?.hazmat),
    afterHours: showRate(agreement.extras?.afterHours),
    afterHoursStart: agreement.extras?.afterHoursStart || "",
    afterHoursEnd: agreement.extras?.afterHoursEnd || "",
  };
}

function parseRate(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a number that is zero or more.`);
  }
  return Math.round(amount * 100) / 100;
}

function formToAgreement(form: FormState): PayAgreement {
  const percent = parseRate(form.percentOfQuote, "Percent of quote");
  if (percent != null && percent > 100) {
    throw new Error("Percent of quote cannot be more than 100.");
  }
  return {
    percentOfQuote: percent,
    flatByType: {
      uld: parseRate(form.flatUld, "ULD flat"),
      skid: parseRate(form.flatSkid, "Skid flat"),
      airport: parseRate(form.flatAirport, "Airport flat"),
    },
    base: parseRate(form.base, "Base"),
    perMile: parseRate(form.perMile, "Per mile"),
    perUld: parseRate(form.perUld, "Per ULD"),
    perSkid: parseRate(form.perSkid, "Per skid"),
    extras: {
      waitFreeMinutes: parseRate(form.waitFreeMinutes, "Free wait minutes"),
      waitPer15Min: parseRate(form.waitPer15Min, "Wait per 15 min"),
      hazmat: parseRate(form.hazmat, "Hazmat"),
      afterHours: parseRate(form.afterHours, "After hours"),
      afterHoursStart: form.afterHoursStart.trim().slice(0, 5),
      afterHoursEnd: form.afterHoursEnd.trim().slice(0, 5),
    },
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "Empty"}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

export default function PayAgreementScreen({ route, navigation }: any) {
  const driverId: string | undefined = route.params?.driverId;
  const driverName: string | undefined = route.params?.driverName;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [logs, setLogs] = useState<PayAgreementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = driverId ? await getDriverPayAgreement(driverId) : await getCompanyPayDefault();
        if (cancelled) return;
        setForm(agreementToForm(result.agreement));
        setLogs(result.logs || []);
      } catch (err: any) {
        if (!cancelled) notify("Couldn't load pay agreement", err?.message ?? "Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const setField = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    let agreement: PayAgreement;
    try {
      agreement = formToAgreement(form);
    } catch (err: any) {
      notify("Check the rates", err?.message ?? "One of the rates is not a number.");
      return;
    }
    setSaving(true);
    try {
      if (driverId) await setDriverPayAgreement(driverId, agreement);
      else await setCompanyPayDefault(agreement);
      const result = driverId ? await getDriverPayAgreement(driverId) : await getCompanyPayDefault();
      setForm(agreementToForm(result.agreement));
      setLogs(result.logs || []);
      notify("Saved", "The pay agreement is updated.");
    } catch (err: any) {
      notify("Couldn't save", err?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const title = driverId ? `${driverName || "Driver"}'s pay agreement` : "Company pay default";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>
        {driverId
          ? "Leave every rate empty until Andres sends this driver's agreement. An empty agreement uses the company default. If that is empty too, jobs say Pay set by dispatch."
          : "Used only for drivers who have no rates of their own. Leave it empty to require dispatch to type a number on each job."}
      </Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <>
          <Text style={styles.section}>Percent of the customer quote</Text>
          <Field label="Percent" value={form.percentOfQuote} onChangeText={setField("percentOfQuote")} />
          <Text style={styles.section}>Flat amount by trip type</Text>
          <Field label="ULD / BUP ($)" value={form.flatUld} onChangeText={setField("flatUld")} />
          <Field label="Skid / loose ($)" value={form.flatSkid} onChangeText={setField("flatSkid")} />
          <Field label="Airport transfer ($)" value={form.flatAirport} onChangeText={setField("flatAirport")} />
          <Text style={styles.section}>Base, miles, and pieces</Text>
          <Field label="Base ($)" value={form.base} onChangeText={setField("base")} />
          <Field label="Per mile ($)" value={form.perMile} onChangeText={setField("perMile")} />
          <Field label="Per ULD ($)" value={form.perUld} onChangeText={setField("perUld")} />
          <Field label="Per skid ($)" value={form.perSkid} onChangeText={setField("perSkid")} />
          <Text style={styles.section}>Extras</Text>
          <Field label="Free wait (minutes)" value={form.waitFreeMinutes} onChangeText={setField("waitFreeMinutes")} />
          <Field label="Wait, per 15 min after that ($)" value={form.waitPer15Min} onChangeText={setField("waitPer15Min")} />
          <Field label="Hazmat ($)" value={form.hazmat} onChangeText={setField("hazmat")} />
          <Field label="After hours ($)" value={form.afterHours} onChangeText={setField("afterHours")} />
          <View style={styles.field}>
            <Text style={styles.label}>After hours starts (HH:mm)</Text>
            <TextInput
              style={styles.input}
              value={form.afterHoursStart}
              onChangeText={setField("afterHoursStart")}
              placeholder="22:00"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>After hours ends (HH:mm)</Text>
            <TextInput
              style={styles.input}
              value={form.afterHoursEnd}
              onChangeText={setField("afterHoursEnd")}
              placeholder="06:00"
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save agreement</Text>}
          </TouchableOpacity>
          <Text style={styles.section}>Change log</Text>
          {logs.length === 0 ? (
            <Text style={styles.hint}>No changes yet.</Text>
          ) : (
            logs.map((log) => (
              <Text key={log.id} style={styles.log}>
                {new Date(log.at).toLocaleString()} · {log.adminName || "Admin"}
              </Text>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginTop: 12, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 12 },
  hint: { fontSize: 13, color: "#666", marginTop: 8, lineHeight: 18 },
  section: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 20, marginBottom: 8 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, color: "#555", marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  save: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  log: { fontSize: 13, color: "#333", marginTop: 6 },
});
