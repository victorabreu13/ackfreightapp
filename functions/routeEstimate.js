// Road miles from Google Distance Matrix when a key is configured.
// Otherwise (or if that call fails) straight-line miles, labeled approximate.

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function haversineMiles(a, b) {
  const earth = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return round1(2 * earth * Math.asin(Math.min(1, Math.sqrt(h))));
}

async function geocodeNominatim(address, fetchImpl) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "ACKFreightDriverLog/1.0 (trip distance estimate)", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeGoogle(address, apiKey, fetchImpl) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const data = await res.json();
  const loc = data.results && data.results[0] && data.results[0].geometry && data.results[0].geometry.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { lat: loc.lat, lng: loc.lng };
}

async function distanceMatrix(from, to, apiKey, fetchImpl) {
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial" +
    `&origins=${encodeURIComponent(from)}&destinations=${encodeURIComponent(to)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const data = await res.json();
  const element = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
  if (!data || data.status !== "OK" || !element || element.status !== "OK") return null;
  if (!element.distance || !element.duration) return null;
  return {
    miles: round1(element.distance.value / 1609.344),
    driveMinutes: Math.max(1, Math.round(element.duration.value / 60)),
  };
}

function approximateFromPoints(origin, destination) {
  if (!origin || !destination) {
    return {
      miles: null,
      driveMinutes: null,
      approximate: true,
      origin: origin || null,
      destination: destination || null,
    };
  }
  const miles = haversineMiles(origin, destination);
  return {
    miles,
    driveMinutes: Math.max(1, Math.round((miles / 25) * 60)),
    approximate: true,
    origin,
    destination,
  };
}

async function estimateRoute(from, to, apiKey, fetchImpl = fetch) {
  const originText = String(from || "").trim();
  const destinationText = String(to || "").trim();
  if (!originText || !destinationText) return null;
  const key = String(apiKey || "").trim();

  if (key) {
    try {
      const [road, origin, destination] = await Promise.all([
        distanceMatrix(originText, destinationText, key, fetchImpl),
        geocodeGoogle(originText, key, fetchImpl),
        geocodeGoogle(destinationText, key, fetchImpl),
      ]);
      if (road) {
        return { ...road, approximate: false, origin, destination };
      }
      return approximateFromPoints(origin, destination);
    } catch (err) {
      // Fall through to the keyless straight-line estimate.
    }
  }

  try {
    const [origin, destination] = await Promise.all([
      geocodeNominatim(originText, fetchImpl),
      geocodeNominatim(destinationText, fetchImpl),
    ]);
    return approximateFromPoints(origin, destination);
  } catch (err) {
    return approximateFromPoints(null, null);
  }
}

module.exports = { haversineMiles, estimateRoute, approximateFromPoints };
