const { readFileSync } = require("node:fs");
const { after, before, beforeEach, describe, it } = require("node:test");
const { assertFails, assertSucceeds, initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");

const PROJECT_ID = "demo-ack-freight";

function line(overrides = {}) {
  return {
    awbNumber: "111",
    qtyPieces: 1,
    type: "AKE",
    kilograms: 10,
    awbFile: null,
    loaFile: null,
    doFile: null,
    assignedDriverId: "drv1",
    assignedDriverName: "Dee",
    status: "assigned",
    priority: "Normal",
    ...overrides,
  };
}

function freshLine(overrides = {}) {
  return line({
    awbNumber: "999",
    assignedDriverId: null,
    assignedDriverName: null,
    status: "submitted",
    ...overrides,
  });
}

function requestDoc(overrides = {}) {
  return {
    customerId: "cust1",
    customerName: "Acme",
    customerEmail: "cust@example.com",
    submittedAt: 1,
    tripDate: "2026-10-02",
    from: "MIA",
    pickupTime: "09:00",
    to: "Warehouse",
    personRequesting: "Pat",
    notes: "",
    awbLines: [line()],
    importFeeFiles: [],
    assignedDriverIds: ["drv1"],
    assignedDriverNames: ["Dee"],
    status: "assigned",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("firestore rules", () => {
  /** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), data);
    });
  }

  // firestore() may be called once per context. A second call tries to
  // reconfigure the emulator connection and throws.
  function asUser(uid, email) {
    return testEnv.authenticatedContext(uid, { email }).firestore();
  }

  it("lets a new user create their own driver or customer profile and nothing else", async () => {
    const driver = asUser("drv1", "driver@example.com");
    await assertSucceeds(
      setDoc(doc(driver, "users/drv1"), {
        uid: "drv1",
        email: "driver@example.com",
        name: "Dee",
        role: "driver",
        createdAt: 1,
      })
    );

    const customer = asUser("cust1", "cust@example.com");
    await assertSucceeds(
      setDoc(doc(customer, "users/cust1"), {
        uid: "cust1",
        email: "cust@example.com",
        name: "Acme",
        role: "customer",
        createdAt: 1,
      })
    );
  });

  it("rejects self-assigned admin and privileged fields on signup", async () => {
    const user = asUser("drv1", "driver@example.com");
    await assertFails(
      setDoc(doc(user, "users/drv1"), {
        uid: "drv1",
        email: "driver@example.com",
        name: "Dee",
        role: "admin",
        createdAt: 1,
      })
    );
    await assertFails(
      setDoc(doc(user, "users/drv1"), {
        uid: "drv1",
        email: "driver@example.com",
        name: "Dee",
        role: "driver",
        createdAt: 1,
        payRate: 50,
      })
    );
    await assertFails(
      setDoc(doc(user, "users/someone-else"), {
        uid: "someone-else",
        email: "driver@example.com",
        name: "Dee",
        role: "driver",
        createdAt: 1,
      })
    );
  });

  it("lets a customer edit cargo, route, and files but not dispatch fields", async () => {
    await seed("tripRequests/req1", requestDoc());
    const customer = asUser("cust1", "cust@example.com");
    const ref = doc(customer, "tripRequests/req1");

    await assertSucceeds(
      updateDoc(ref, {
        from: "MIA cargo",
        notes: "dock 4",
        awbLines: [line({ kilograms: 42, awbFile: { url: "https://files/awb.pdf", name: "awb.pdf" } })],
        updatedAt: 2,
      })
    );

    await assertSucceeds(
      updateDoc(ref, {
        awbLines: [line(), freshLine()],
        updatedAt: 3,
      })
    );
  });

  it("lets a customer remove AWB lines and append a fresh one", async () => {
    await seed(
      "tripRequests/req1",
      requestDoc({
        awbLines: [
          line({ awbNumber: "111" }),
          line({ awbNumber: "222", assignedDriverId: "drv2", assignedDriverName: "Sam" }),
          line({ awbNumber: "333", assignedDriverId: "drv3", assignedDriverName: "Jo" }),
        ],
        assignedDriverIds: ["drv1", "drv2", "drv3"],
        assignedDriverNames: ["Dee", "Sam", "Jo"],
      })
    );
    const customer = asUser("cust1", "cust@example.com");
    const ref = doc(customer, "tripRequests/req1");
    await assertSucceeds(
      updateDoc(ref, {
        awbLines: [line({ awbNumber: "222", assignedDriverId: "drv2", assignedDriverName: "Sam" })],
        updatedAt: 2,
      })
    );
    await assertSucceeds(
      updateDoc(ref, {
        awbLines: [
          line({ awbNumber: "222", kilograms: 8, assignedDriverId: "drv2", assignedDriverName: "Sam" }),
          freshLine(),
        ],
        updatedAt: 3,
      })
    );
    await assertFails(
      updateDoc(ref, {
        awbLines: [
          freshLine(),
          line({ awbNumber: "222", assignedDriverId: "drv2", assignedDriverName: "Sam" }),
        ],
        updatedAt: 4,
      })
    );
  });

  it("rejects customer changes to line status, driver, rollup, or live location", async () => {
    await seed("tripRequests/req1", requestDoc());
    const customer = asUser("cust1", "cust@example.com");
    const ref = doc(customer, "tripRequests/req1");

    await assertFails(
      updateDoc(ref, {
        awbLines: [line({ status: "completed" })],
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(ref, {
        awbLines: [line({ assignedDriverId: "drv9", assignedDriverName: "Pat" })],
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(ref, {
        assignedDriverIds: [],
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(ref, {
        driverLocations: { drv1: { lat: 1, lng: 2, updatedAt: 3 } },
        updatedAt: 2,
      })
    );
  });

  it("rejects swapping two lines that have different drivers", async () => {
    await seed(
      "tripRequests/req1",
      requestDoc({
        awbLines: [
          line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee" }),
          line({ awbNumber: "222", assignedDriverId: "drv2", assignedDriverName: "Sam" }),
        ],
        assignedDriverIds: ["drv1", "drv2"],
        assignedDriverNames: ["Dee", "Sam"],
      })
    );
    const customer = asUser("cust1", "cust@example.com");
    await assertFails(
      updateDoc(doc(customer, "tripRequests/req1"), {
        awbLines: [
          line({ awbNumber: "111", assignedDriverId: "drv2", assignedDriverName: "Sam" }),
          line({ awbNumber: "222", assignedDriverId: "drv1", assignedDriverName: "Dee" }),
        ],
        updatedAt: 2,
      })
    );
  });

  it("lets a customer cancel before the trip starts and blocks edits after", async () => {
    await seed("tripRequests/req1", requestDoc());
    const customer = asUser("cust1", "cust@example.com");
    await assertSucceeds(
      updateDoc(doc(customer, "tripRequests/req1"), {
        status: "cancelled",
        updatedAt: 2,
      })
    );

    await seed("tripRequests/req2", requestDoc({ status: "in_progress" }));
    await assertFails(
      updateDoc(doc(customer, "tripRequests/req2"), {
        from: "Elsewhere",
        updatedAt: 2,
      })
    );
  });

  it("requires customer-created requests to start unassigned", async () => {
    const customer = asUser("cust1", "cust@example.com");
    const ref = doc(customer, "tripRequests/new1");
    const base = {
      customerId: "cust1",
      customerName: "Acme",
      customerEmail: "cust@example.com",
      submittedAt: 1,
      tripDate: "2026-10-02",
      from: "MIA",
      pickupTime: "09:00",
      to: "Warehouse",
      personRequesting: "Pat",
      notes: "",
      importFeeFiles: [],
      assignedDriverIds: [],
      assignedDriverNames: [],
      status: "submitted",
      createdAt: 1,
      updatedAt: 1,
    };
    await assertSucceeds(setDoc(ref, { ...base, awbLines: [freshLine()] }));
    await assertFails(
      setDoc(doc(customer, "tripRequests/new2"), {
        ...base,
        awbLines: [line()],
      })
    );
  });

  it("lets an admin change assignment and blocks drivers from writing the request", async () => {
    await seed("users/admin1", {
      uid: "admin1",
      email: "admin@example.com",
      name: "Ada",
      role: "admin",
      createdAt: 1,
    });
    await seed("tripRequests/req1", requestDoc());

    await seed("users/drv1", {
      uid: "drv1",
      email: "driver@example.com",
      name: "Dee",
      role: "driver",
      createdAt: 1,
    });
    const driver = asUser("drv1", "driver@example.com");
    await assertSucceeds(getDoc(doc(driver, "tripRequests/req1")));
    await assertFails(
      updateDoc(doc(driver, "tripRequests/req1"), {
        from: "Nope",
        updatedAt: 3,
      })
    );

    const admin = asUser("admin1", "admin@example.com");
    await assertSucceeds(
      updateDoc(doc(admin, "tripRequests/req1"), {
        awbLines: [line({ assignedDriverId: "drv2", assignedDriverName: "Sam" })],
        assignedDriverIds: ["drv2"],
        assignedDriverNames: ["Sam"],
        updatedAt: 2,
      })
    );
  });

  it("lets a driver set their own on-duty flag and nobody else's", async () => {
    await seed("users/drv1", {
      uid: "drv1",
      email: "driver@example.com",
      name: "Dee",
      role: "driver",
      createdAt: 1,
    });
    const driver = asUser("drv1", "driver@example.com");
    await assertSucceeds(updateDoc(doc(driver, "users/drv1"), { onDuty: true }));
    await assertFails(updateDoc(doc(driver, "users/drv1"), { onDuty: "yes" }));
    await assertFails(updateDoc(doc(driver, "users/someone"), { onDuty: true }));

    await seed("users/cust1", {
      uid: "cust1",
      email: "cust@example.com",
      name: "Acme",
      role: "customer",
      createdAt: 1,
    });
    const customer = asUser("cust1", "cust@example.com");
    await assertFails(updateDoc(doc(customer, "users/cust1"), { onDuty: true }));
  });

  it("hides trip logs and ULD claims from customers", async () => {
    await seed("trips/trip1", { driverId: "drv1", awbNumber: "111", uldNumbers: ["AKE1"] });
    await seed("tripUldKeys/abc", { tripIds: { trip1: true } });
    const customer = asUser("cust1", "cust@example.com");
    await assertFails(getDoc(doc(customer, "trips/trip1")));
    await assertFails(getDoc(doc(customer, "tripUldKeys/abc")));
  });

  it("keeps driver pay and agreements admin-only, and a driver sees only their own pay", async () => {
    await seed("users/admin1", {
      uid: "admin1",
      email: "admin@example.com",
      name: "Ada",
      role: "admin",
      createdAt: 1,
    });
    await seed("users/drv1", {
      uid: "drv1",
      email: "driver@example.com",
      name: "Dee",
      role: "driver",
      createdAt: 1,
    });
    await seed("users/drv2", {
      uid: "drv2",
      email: "sam@example.com",
      name: "Sam",
      role: "driver",
      createdAt: 1,
    });
    await seed("users/cust1", {
      uid: "cust1",
      email: "cust@example.com",
      name: "Acme",
      role: "customer",
      createdAt: 1,
    });
    await seed("driverPayAgreements/drv1", { driverId: "drv1", percentOfQuote: 40 });
    await seed("driverPayAgreements/drv2", { driverId: "drv2", base: 30 });
    await seed("config/driverPayDefault", { base: 10 });
    await seed("awbPay/req1_0", { requestId: "req1", awbIndex: 0, driverId: "drv1", amount: 40, status: "quoted" });
    await seed("awbPay/req1_1", { requestId: "req1", awbIndex: 1, driverId: "drv2", amount: 55, status: "quoted" });
    await seed("awbPayOverrides/req1_0", { amount: 40, reason: "manual" });
    await seed("driverPayAudit/a1", { kind: "override", amount: 40 });

    const dee = asUser("drv1", "driver@example.com");
    const sam = asUser("drv2", "sam@example.com");
    const customer = asUser("cust1", "cust@example.com");
    const admin = asUser("admin1", "admin@example.com");

    await assertSucceeds(getDoc(doc(dee, "awbPay/req1_0")));
    await assertFails(getDoc(doc(dee, "awbPay/req1_1")));
    await assertFails(getDoc(doc(dee, "driverPayAgreements/drv2")));
    await assertFails(getDoc(doc(dee, "driverPayAgreements/drv1")));
    await assertFails(getDoc(doc(dee, "config/driverPayDefault")));
    await assertFails(getDoc(doc(sam, "awbPay/req1_0")));
    await assertFails(getDoc(doc(customer, "awbPay/req1_0")));
    await assertFails(getDoc(doc(customer, "driverPayAgreements/drv1")));
    await assertFails(getDoc(doc(customer, "config/driverPayDefault")));
    await assertFails(getDoc(doc(customer, "awbPayOverrides/req1_0")));

    await assertSucceeds(getDoc(doc(admin, "driverPayAgreements/drv1")));
    await assertSucceeds(getDoc(doc(admin, "config/driverPayDefault")));
    await assertSucceeds(getDoc(doc(admin, "awbPay/req1_1")));
    await assertFails(setDoc(doc(admin, "awbPay/req1_0"), { driverId: "drv1", amount: 1 }));
    await assertFails(setDoc(doc(dee, "awbPay/req1_0"), { driverId: "drv1", amount: 999 }));
    await assertFails(setDoc(doc(admin, "config/driverPayDefault"), { base: 99 }));
    await assertFails(setDoc(doc(admin, "driverPayAgreements/drv1"), { percentOfQuote: 99 }));
  });
});
