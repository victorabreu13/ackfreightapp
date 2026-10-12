import { useEffect, useMemo, useState } from "react";
import { Lead, subscribeToPendingLeads } from "../services/leads";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { subscribeToDrivers } from "../services/users";
import { TripRequest, UserProfile } from "../types";
import { driverStates, DriverState } from "../utils/dispatchBoard";

// Live data shared by the Today board, Live Map, Drivers and alerts.
// Read-only: same subscriptions the existing Dispatch / Drivers Available
// screens already use.
export function useDispatchData(opts: { leads?: boolean } = {}) {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(
    () =>
      subscribeToAllTripRequests(
        (data) => {
          setRequests(data);
          setLoading(false);
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        }
      ),
    []
  );

  useEffect(
    () =>
      subscribeToDrivers(
        (data) => setDrivers(data.filter((d) => d.active !== false)),
        (e) => console.error("drivers subscription:", e)
      ),
    []
  );

  useEffect(() => {
    if (!opts.leads) return;
    return subscribeToPendingLeads(setLeads, (e) => console.error("leads subscription:", e));
  }, [opts.leads]);

  // GPS age and "pickup soon" alerts depend on the clock, not only on data.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const states: DriverState[] = useMemo(
    () => driverStates(drivers, requests, nowMs),
    [drivers, requests, nowMs]
  );

  return { requests, drivers, driverStates: states, leads, loading, error, nowMs };
}
