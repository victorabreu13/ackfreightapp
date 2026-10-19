import React, { useMemo, useState } from "react";
import { StyleProp, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from "react-native";
import { usePlaces } from "../services/places";
import { placeKey, suggestPlaces } from "../utils/places";

// A text field that suggests places (airlines, saved places) as you type. It is
// still a normal text box: anything can be typed, and a new place is saved for
// everyone when the trip is submitted.
export default function PlaceInput({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const places = usePlaces();
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => (focused ? suggestPlaces(places, value) : []), [places, value, focused]);
  const isNew =
    focused &&
    value.trim().length >= 2 &&
    matches.length === 0 &&
    !places.some((p) => placeKey(p.name) === placeKey(value));

  return (
    <View>
      <TextInput
        style={style}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        // Delay so a tap on a suggestion lands before the list disappears.
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {matches.length > 0 && (
        <View style={styles.list}>
          {matches.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={styles.item}
              onPressIn={() => onChangeText(p.name)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${p.name}`}
            >
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.kind}>{p.kind}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {isNew && <Text style={styles.hint}>New place — it will be saved so others can pick it next time.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  name: { flex: 1, fontSize: 14, color: "#0f172a", fontWeight: "600" },
  kind: { fontSize: 11.5, color: "#94a3b8", fontWeight: "600" },
  hint: { fontSize: 12, color: "#64748b", marginTop: 4 },
});
