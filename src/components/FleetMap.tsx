import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { DEFAULT_CENTER, FleetMapProps } from "./fleetMapTypes";

// Native fleet map — same react-native-maps setup LiveMap.tsx already uses
// (Apple Maps on iPhone, Google Maps on Android with the existing build key).
// Metro picks FleetMap.web.tsx for the web bundle instead.
export default function FleetMap({ drivers, routes = [], height = 360, onPressDriver }: FleetMapProps) {
  const first = drivers[0] ?? null;
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={[styles.map, { height }]}
      initialRegion={{
        latitude: first?.lat ?? DEFAULT_CENTER.lat,
        longitude: first?.lng ?? DEFAULT_CENTER.lng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }}
    >
      {routes.map((r) => (
        <Polyline
          key={r.id}
          coordinates={[
            { latitude: r.from.lat, longitude: r.from.lng },
            { latitude: r.to.lat, longitude: r.to.lng },
          ]}
          strokeColor={r.color}
          strokeWidth={3}
          lineDashPattern={[6, 6]}
        />
      ))}
      {drivers.map((d) => (
        <Marker
          key={d.id}
          coordinate={{ latitude: d.lat, longitude: d.lng }}
          title={d.label}
          description={d.detail}
          onPress={() => onPressDriver?.(d.id)}
        >
          <View style={[styles.pin, { backgroundColor: d.stale ? "#64748b" : d.color }]}>
            <Text style={styles.pinText}>🚚 {d.label}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", borderRadius: 12 },
  pin: { borderRadius: 12, borderWidth: 2, borderColor: "#fff", paddingHorizontal: 6, paddingVertical: 2 },
  pinText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
