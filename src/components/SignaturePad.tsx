import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

export type SignatureStrokes = number[][][];

interface Props {
  strokes: SignatureStrokes;
  onChange: (strokes: SignatureStrokes) => void;
  height?: number;
}

function segmentStyle(
  a: number[],
  b: number[],
  width: number,
  height: number
) {
  const x1 = a[0] * width;
  const y1 = a[1] * height;
  const x2 = b[0] * width;
  const y2 = b[1] * height;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = `${Math.atan2(y2 - y1, x2 - x1)}rad`;
  return {
    position: "absolute" as const,
    left: x1,
    top: y1 - 1,
    width: Math.max(length, 1),
    height: 2,
    backgroundColor: "#111",
    transformOrigin: "0% 50%",
    transform: [{ rotate: angle }],
  };
}

export function strokesToSvg(strokes: SignatureStrokes): string {
  const width = 300;
  const height = 120;
  const paths = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const [x, y] = stroke[0];
      const rest = stroke
        .slice(1)
        .map((point) => `L ${(point[0] * width).toFixed(1)} ${(point[1] * height).toFixed(1)}`)
        .join(" ");
      return `<path d="M ${(x * width).toFixed(1)} ${(y * height).toFixed(1)} ${rest}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`;
}

export function SignaturePreview({
  strokes,
  height = 120,
}: {
  strokes: SignatureStrokes;
  height?: number;
}) {
  return (
    <View style={[styles.pad, { height }]}>
      <StrokeLayer strokes={strokes} />
    </View>
  );
}

function StrokeLayer({ strokes }: { strokes: SignatureStrokes }) {
  const [size, setSize] = useState({ width: 300, height: 120 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) =>
        setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
      }
    >
      {strokes.flatMap((stroke, strokeIndex) =>
        stroke.slice(1).map((point, pointIndex) => (
          <View
            key={`${strokeIndex}-${pointIndex}`}
            style={segmentStyle(stroke[pointIndex], point, size.width, size.height)}
          />
        ))
      )}
    </View>
  );
}

export default function SignaturePad({ strokes, onChange, height = 140 }: Props) {
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const sizeRef = useRef({ width: 1, height: 1 });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const { width, height: h } = sizeRef.current;
        const point: number[] = [
          Math.min(1, Math.max(0, locationX / width)),
          Math.min(1, Math.max(0, locationY / h)),
        ];
        onChange([...strokesRef.current, [point]]);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const { width, height: h } = sizeRef.current;
        const point: number[] = [
          Math.min(1, Math.max(0, locationX / width)),
          Math.min(1, Math.max(0, locationY / h)),
        ];
        const next = strokesRef.current.map((stroke) => stroke.map((p) => [...p]));
        if (next.length === 0) next.push([]);
        next[next.length - 1].push(point);
        onChange(next);
      },
    })
  ).current;

  return (
    <View>
      <View
        style={[styles.pad, { height }]}
        onLayout={(event) => {
          sizeRef.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
        {...responder.panHandlers}
      >
        <StrokeLayer strokes={strokes} />
        {strokes.length === 0 && <Text style={styles.hint}>Sign here</Text>}
      </View>
      {strokes.length > 0 && (
        <Text style={styles.clear} onPress={() => onChange([])}>
          Clear signature
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    top: "40%",
    color: "#aaa",
    fontSize: 14,
  },
  clear: { color: "#1d4ed8", fontWeight: "700", marginTop: 8 },
});
