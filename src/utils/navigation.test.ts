import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { navigationTargets } from "./driverPayDisplay";

describe("navigationTargets", () => {
  const targets = navigationTargets("MIA Cargo, Miami");

  it("opens Apple Maps, Google Maps, and Waze with a web fallback", () => {
    assert.equal(targets.apple.appUrl, "maps://?daddr=MIA%20Cargo%2C%20Miami&dirflg=d");
    assert.equal(targets.apple.webUrl, "http://maps.apple.com/?daddr=MIA%20Cargo%2C%20Miami&dirflg=d");
    assert.equal(
      targets.google.appUrl,
      "comgooglemaps://?daddr=MIA%20Cargo%2C%20Miami&directionsmode=driving"
    );
    assert.match(targets.google.webUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
    assert.equal(targets.waze.appUrl, "waze://?q=MIA%20Cargo%2C%20Miami&navigate=yes");
    assert.match(targets.waze.webUrl, /^https:\/\/waze\.com\/ul\?q=/);
  });
});

// Dispatch board tests ride along here instead of being added to the
// package.json "test" script: changing package.json scripts changes the Expo
// fingerprint (runtimeVersion), which would cut existing native builds off
// from OTA updates.
import "./tripStatus.test";
import "./dispatchBoard.test";
