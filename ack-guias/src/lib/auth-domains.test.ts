import assert from "node:assert/strict";
import test from "node:test";
import { allowedDomains, emailDomainAllowed, hostedDomainAllowed } from "./auth-domains";

test("only the ackfreight.com Workspace domain can sign in", () => {
  assert.deepEqual(allowedDomains(), ["ackfreight.com"]);
  assert.equal(emailDomainAllowed("victor.abreu@ackfreight.com"), true);
  assert.equal(emailDomainAllowed("Andres.Alvarado@ackfreight.com"), true);
  assert.equal(emailDomainAllowed("person@gmail.com"), false);
  assert.equal(emailDomainAllowed("ops@mail.ackfreight.com"), false);
  assert.equal(hostedDomainAllowed("ackfreight.com"), true);
  assert.equal(hostedDomainAllowed("ACKFREIGHT.COM"), true);
  assert.equal(hostedDomainAllowed(undefined), false);
  assert.equal(hostedDomainAllowed("gmail.com"), false);
});
