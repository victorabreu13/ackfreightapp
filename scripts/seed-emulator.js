// Seeds the LOCAL Firebase emulators with example data for trying the
// dispatch screens (Today, Live Map, Trips…) without touching real data.
//
//   firebase emulators:start --only auth,firestore --project demo-ack-freight
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     GCLOUD_PROJECT=demo-ack-freight node scripts/seed-emulator.js
//
// Optional: SEED_DATE=YYYY-MM-DD (default today) and SEED_NOW=<epoch ms>
// (the "current time" GPS points are stamped against; default now).
// Logins: admin@example.test / password123 (drivers/clients use the same password).
//
// Refuses to run unless both emulator hosts are set and the project id
// starts with "demo-", so it can never write to the live project.

const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const projectId = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !projectId.startsWith("demo-")) {
  console.error("Refusing to seed: set FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST and a demo-* GCLOUD_PROJECT.");
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const NOW = Number(process.env.SEED_NOW || Date.now());
const DAY = process.env.SEED_DATE || localDate(new Date(NOW));
const [Y, M, D] = DAY.split("-").map(Number);
const YESTERDAY = localDate(new Date(Y, M - 1, D - 1));
const PASSWORD = "password123";

const P = {
  mia701: { lat: 25.8095, lng: -80.306, name: "MIA Cargo Bldg 701 (example)" },
  mia706: { lat: 25.809, lng: -80.301, name: "MIA Cargo Bldg 706 (example)" },
  mia712: { lat: 25.8085, lng: -80.296, name: "MIA Cargo Bldg 712 (example)" },
  mia714: { lat: 25.807, lng: -80.2935, name: "MIA Cargo Bldg 714 (example)" },
  mia716: { lat: 25.8075, lng: -80.2905, name: "MIA Swissport Bldg 716 (example)" },
  doral25: { lat: 25.7988, lng: -80.333, name: "Doral warehouse, 8400 NW 25 St (example)" },
  doral82: { lat: 25.8045, lng: -80.329, name: "Doral warehouse, NW 82 Ave (example)" },
  freezone: { lat: 25.799, lng: -80.3445, name: "Doral free-zone warehouse (example)" },
  medley: { lat: 25.853, lng: -80.327, name: "Medley warehouse, NW 70 St (example)" },
  hialeah: { lat: 25.844, lng: -80.302, name: "Hialeah warehouse (example)" },
  opalocka: { lat: 25.9, lng: -80.279, name: "Opa-locka warehouse (example)" },
};

const USERS = [
  { key: "admin", name: "Dispatch (example)", role: "admin" },
  { key: "jorge", name: "Jorge P.", role: "driver", onDuty: true },
  { key: "luis", name: "Luis R.", role: "driver", onDuty: true },
  { key: "manuel", name: "Manuel G.", role: "driver", onDuty: true },
  { key: "carlos", name: "Carlos M.", role: "driver", onDuty: true },
  { key: "yoel", name: "Yoel D.", role: "driver", onDuty: false },
  { key: "ana", name: "Ana T.", role: "driver", onDuty: true },
  { key: "andes", name: "Andes Cargo (example)", role: "customer" },
  { key: "pacific", name: "Pacific Forwarding (example)", role: "customer" },
  { key: "caribe", name: "Caribe Logistics (example)", role: "customer" },
  { key: "sol", name: "Sol Freight (example)", role: "customer" },
  { key: "tropic", name: "Tropic Air Logistics (example)", role: "customer" },
  { key: "global", name: "Global Perishables (example)", role: "customer" },
];

let awbSeq = 12345670;
function awb(type, qty, kg, status, driver, extra = {}) {
  awbSeq += 11;
  const n = String(awbSeq);
  return {
    awbNumber: `045-${n.slice(0, 4)} ${n.slice(4)}`,
    qtyPieces: qty,
    type,
    kilograms: kg,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    hazmat: false,
    unNumber: null,
    hazmatClass: null,
    awbFile: null,
    loaFile: null,
    doFile: null,
    assignedDriverId: driver ? driver.uid : null,
    assignedDriverName: driver ? driver.name : null,
    status,
    priority: "Normal",
    ...(status === "accepted" || status === "in_progress" || status === "picked_up" || status === "completed"
      ? { acceptedAt: NOW - 3 * 3600e3 }
      : {}),
    ...(status === "in_progress" || status === "picked_up" || status === "completed" ? { startedAt: NOW - 2 * 3600e3 } : {}),
    ...(status === "picked_up" || status === "completed" ? { pickedUpAt: NOW - 3600e3 } : {}),
    ...extra,
  };
}

function rollup(lines) {
  const ids = [...new Set(lines.map((l) => l.assignedDriverId).filter(Boolean))];
  const names = [...new Set(lines.map((l) => l.assignedDriverName).filter(Boolean))];
  let status = "submitted";
  if (lines.every((l) => l.status === "completed")) status = "completed";
  else if (lines.some((l) => ["in_progress", "picked_up", "completed"].includes(l.status))) status = "in_progress";
  else if (lines.some((l) => ["assigned", "accepted"].includes(l.status))) status = "assigned";
  return { status, assignedDriverIds: ids, assignedDriverNames: names };
}

async function main() {
  const u = {};
  for (const def of USERS) {
    const email = `${def.key}@example.test`;
    let rec;
    try {
      rec = await auth.getUserByEmail(email);
    } catch {
      rec = await auth.createUser({ email, password: PASSWORD, displayName: def.name });
    }
    const profile = { uid: rec.uid, email, name: def.name, role: def.role, createdAt: NOW, active: true };
    if (def.role === "driver") profile.onDuty = def.onDuty;
    if (def.role === "customer") Object.assign(profile, { billType: "perTrip", billRate: 350 });
    await db.collection("users").doc(rec.uid).set(profile);
    u[def.key] = profile;
  }

  const trips = [
    { id: "ex-1036", c: "sol", date: DAY, t: "06:30", from: P.mia701, to: P.medley, lines: [awb("PMC", 1, 1450, "completed", u.ana)], invoiced: true },
    { id: "ex-1038", c: "pacific", date: DAY, t: "07:00", from: P.mia712, to: P.doral82, lines: [awb("PMC", 2, 2900, "completed", u.carlos)] },
    { id: "ex-1039", c: "caribe", date: DAY, t: "08:00", from: P.doral82, to: P.mia706, lines: [awb("Skid", 4, 1300, "completed", u.luis)] },
    { id: "ex-1042", c: "andes", date: DAY, t: "09:00", from: P.mia716, to: P.doral25,
      lines: [awb("PMC", 1, 1640, "picked_up", u.jorge), awb("PMC", 1, 1540, "picked_up", u.jorge, { hazmat: true, unNumber: "UN3480", hazmatClass: "9" })],
      loc: { jorge: { lat: 25.799, lng: -80.315, updatedAt: NOW - 20e3 } } },
    { id: "ex-1047", c: "global", date: DAY, t: "09:30", from: P.mia716, to: P.medley, lines: [awb("PMC", 1, 2100, "picked_up", u.manuel)],
      loc: { manuel: { lat: 25.826, lng: -80.305, updatedAt: NOW - 9 * 60e3 } } },
    { id: "ex-1044", c: "caribe", date: DAY, t: "10:00", from: P.medley, to: P.mia706, lines: [awb("Skid", 6, 2050, "in_progress", u.luis)],
      loc: { luis: { lat: 25.841, lng: -80.324, updatedAt: NOW - 45e3 } } },
    { id: "ex-1045", c: "sol", date: DAY, t: "10:55", from: P.mia701, to: P.freezone, lines: [awb("PAG", 1, 900, "submitted", null), awb("Loose", 3, 340, "submitted", null)] },
    { id: "ex-1043", c: "pacific", date: DAY, t: "12:00", from: P.doral82, to: P.mia712, lines: [awb("PMC", 4, 5600, "accepted", u.carlos)] },
    { id: "ex-1046", c: "andes", date: DAY, t: "13:30", from: P.mia714, to: P.hialeah, lines: [awb("FQA", 2, 2900, "submitted", null)] },
    { id: "ex-1048", c: "tropic", date: DAY, t: "14:30", from: P.opalocka, to: P.mia716, lines: [awb("PMC", 3, 4100, "assigned", u.yoel, { hazmat: true, unNumber: "UN1845", hazmatClass: "9" })] },
    { id: "ex-1049", c: "global", date: DAY, t: "15:00", from: P.mia714, to: P.doral25, lines: [awb("AKE", 2, 600, "submitted", null)], cancelled: true },
    { id: "ex-1031", c: "andes", date: YESTERDAY, t: "16:00", from: P.doral25, to: P.mia712, lines: [awb("PMC", 3, 4020, "accepted", u.ana)] },
  ];

  for (const tr of trips) {
    const cust = u[tr.c];
    const roll = rollup(tr.lines);
    const doc = {
      customerId: cust.uid,
      customerName: cust.name,
      customerEmail: cust.email,
      submittedAt: NOW - 5 * 3600e3,
      tripDate: tr.date,
      from: tr.from.name,
      pickupTime: tr.t,
      to: tr.to.name,
      personRequesting: "Example contact",
      notes: "",
      awbLines: tr.lines,
      importFeeFiles: [],
      ...roll,
      status: tr.cancelled ? "cancelled" : tr.invoiced ? "invoiced" : roll.status,
      quotedAmount: 350,
      quoteStatus: "quoted",
      quoteBasis: "perTrip",
      routeEstimate: { miles: 5, driveMinutes: 15, approximate: true, origin: { lat: tr.from.lat, lng: tr.from.lng }, destination: { lat: tr.to.lat, lng: tr.to.lng } },
      createdAt: NOW - 5 * 3600e3,
      updatedAt: NOW,
    };
    if (tr.invoiced) doc.invoicedAt = NOW - 3600e3;
    if (tr.loc) {
      doc.driverLocations = Object.fromEntries(Object.entries(tr.loc).map(([k, v]) => [u[k].uid, v]));
    }
    await db.collection("tripRequests").doc(tr.id).set(doc);
  }

  await db.collection("leads").doc("ex-lead-1").set({
    status: "pending",
    contactName: "Laura G. (example)",
    email: "laura@example.test",
    from: "MIA Cargo Bldg 701",
    to: "Doral",
    tripDate: DAY,
    createdAt: NOW - 30 * 60e3,
  });

  console.log(`Seeded ${USERS.length} users, ${trips.length} trips and 1 lead for ${DAY} in ${projectId}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
