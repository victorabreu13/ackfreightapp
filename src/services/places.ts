import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase/config";
import { MIA_PLACES, Place } from "../data/miaPlaces";
import { mergePlaces, placeKey } from "../utils/places";

// Places people have typed that weren't in the built-in list. One shared
// listener for every input on screen; the built-in list works even if this
// can't load.
let saved: string[] = [];
let started = false;
const listeners = new Set<(names: string[]) => void>();

function start() {
  if (started) return;
  started = true;
  onSnapshot(
    collection(db, "places"),
    (snapshot) => {
      saved = snapshot.docs.map((d) => String(d.data().name ?? "")).filter(Boolean);
      listeners.forEach((l) => l(saved));
    },
    (err) => {
      started = false;
      console.error("places listener failed:", err);
    }
  );
}

/** Built-in airlines plus every place anyone has saved. */
export function usePlaces(): Place[] {
  const [names, setNames] = useState<string[]>(saved);
  useEffect(() => {
    start();
    listeners.add(setNames);
    setNames(saved);
    return () => {
      listeners.delete(setNames);
    };
  }, []);
  return mergePlaces(MIA_PLACES, names);
}

/**
 * Save a typed place for everyone if nobody has used it before. Fire and forget:
 * a failure (offline, rules not deployed yet) must never block saving a trip.
 */
export async function savePlaceIfNew(name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ");
  const key = placeKey(clean);
  if (clean.length < 2 || clean.length > 80 || !key || !auth.currentUser) return;
  const known = mergePlaces(MIA_PLACES, saved);
  if (known.some((p) => placeKey(p.name) === key)) return;
  try {
    await setDoc(doc(db, "places", key), {
      name: clean,
      createdBy: auth.currentUser.uid,
      createdAt: Date.now(),
    });
    saved = [...saved, clean];
    listeners.forEach((l) => l(saved));
  } catch (err) {
    console.error("Couldn't save place:", err);
  }
}
