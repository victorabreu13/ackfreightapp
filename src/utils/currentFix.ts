import * as Location from "expo-location";

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * The phone's exact position right now, for stamping where a trip was started,
 * picked up or completed. Returns undefined (never throws, never asks for
 * permission) if location isn't allowed or no fix arrives in a few seconds; the
 * server then uses the driver's last live ping instead.
 */
export async function currentFix(timeoutMs = 4000): Promise<Fix | undefined> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") return undefined;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!pos) return undefined;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : undefined,
    };
  } catch (err) {
    console.error("Couldn't read the current position:", err);
    return undefined;
  }
}
