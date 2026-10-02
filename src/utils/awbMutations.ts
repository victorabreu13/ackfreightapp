import { AwbLine, computeTripRequestRollup } from "../types";

// Dispatch assignment for one AWB line. Status goes back to "assigned" (or
// "submitted" when cleared) so a replacement driver has to tap Start.
// Other dispatch fields on the line (tripLogId, startedAt) are left as they
// were — same as the previous inline write.
export function applyAwbAssignment(
  awbLines: AwbLine[],
  awbIndex: number,
  driverId: string | null,
  driverName: string | null
) {
  const previousDriverId = awbLines[awbIndex]?.assignedDriverId ?? null;
  const nextLines: AwbLine[] = awbLines.map((line, index) =>
    index === awbIndex
      ? {
          ...line,
          assignedDriverId: driverId,
          assignedDriverName: driverName,
          status: driverId ? "assigned" : "submitted",
        }
      : line
  );
  return {
    previousDriverId,
    awbLines: nextLines,
    ...computeTripRequestRollup(nextLines),
  };
}
