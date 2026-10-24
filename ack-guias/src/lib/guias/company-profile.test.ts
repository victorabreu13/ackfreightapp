import assert from "node:assert/strict";
import test from "node:test";
import { ACK_TSA_IAC, applyKopeOverrides, missingProfileMessages, shown, tsaIacFor, type CompanyView } from "./company-profile";

function profile(agentKey: string): CompanyView {
  return {
    agentKey,
    brandName: agentKey,
    letterheadName: agentKey,
    address: "",
    phone: "",
    fax: "",
    opsEmail: "",
    contactName: "",
    contactTitle: "",
    termsUrl: "",
    tsaIacId: "",
    ccsfId: "",
    warehouseName: "",
    warehouseAddress: "",
    signerName: "",
    signerTitle: "",
    logo: null,
    logoMime: null,
  };
}

test("KOPE env overrides do not leak onto ACK", () => {
  const env = {
    KOPE_COMPANY_NAME: "Kope Override",
    KOPE_TSA_IAC: "IAC-1",
    KOPE_SIGNER: "Levy Martinez",
  };
  const ack = applyKopeOverrides(profile("ack"), env);
  assert.equal(ack.letterheadName, "ack");
  assert.equal(ack.tsaIacId, "");
  assert.equal(shown(ack.tsaIacId), "NOT SET");
  const kope = applyKopeOverrides(profile("kope"), env);
  assert.equal(kope.letterheadName, "Kope Override");
  assert.equal(kope.tsaIacId, "IAC-1");
  assert.equal(kope.signerName, "Levy Martinez");
  assert.equal(missingProfileMessages(ack).includes("TSA IAC id missing"), true);
  assert.equal(missingProfileMessages(kope).includes("TSA IAC id missing"), false);
  assert.equal(missingProfileMessages(kope).includes("Signer name missing"), false);
  assert.equal(tsaIacFor(ack), ACK_TSA_IAC);
  assert.equal(tsaIacFor({ ...ack, tsaIacId: "SE2508006" }), "SE2508006");
  assert.equal(tsaIacFor(profile("kope")), "SE1701005");
  assert.notEqual(ACK_TSA_IAC, "SE1701005");
});
