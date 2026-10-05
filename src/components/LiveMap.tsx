import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

interface Props {
  lat: number;
  lng: number;
  label?: string;
}

// Native implementation — react-native-maps has no web build at all, so
// this file is kept out of the web bundle entirely via the .web.tsx
// sibling, which Metro picks instead when bundling for web.
// PROVIDER_DEFAULT is Apple Maps on iOS (no Google key) and Google Maps on Android.
export default function LiveMap({ lat, lng, label }: Props) {
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={styles.map}
      region={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Marker coordinate={{ latitude: lat, longitude: lng }} title={label} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 220, borderRadius: 12 },
});
