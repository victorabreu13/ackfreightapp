// Per-driver pay for one AWB. The client never runs this.
// Breakdown labels are dollar amounts only — no customer price and no margin.

const ULD_TYPES = new Set(["PMC", "FQA", "PAG", "DQF", "ALF", "AKE"]);
const TIME_ZONE = "America/New_York";

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function rateOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

function agreementHasRates(agreement) {
  if (!agreement || typeof agreement !== "object") return false;
  if (rateOrNull(agreement.percentOfQuote) != null) return true;
  const flat = agreement.flatByType || {};
  if (rateOrNull(flat.uld) != null || rateOrNull(flat.skid) != null || rateOrNull(flat.airport) != null) {
    return true;
  }
  if (
    rateOrNull(agreement.base) != null ||
    rateOrNull(agreement.perMile) != null ||
    rateOrNull(agreement.perUld) != null ||
    rateOrNull(agreement.perSkid) != null
  ) {
    return true;
  }
  const extras = agreement.extras || {};
  if (
    rateOrNull(extras.hazmat) != null ||
    rateOrNull(extras.afterHours) != null ||
    rateOrNull(extras.waitPer15Min) != null
  ) {
    return true;
  }
  return false;
}

// A driver's own agreement wins. The company default is only for drivers
// with no rates filled in. Both empty means dispatch has to type a number.
function resolveAgreement(driverAgreement, companyDefault) {
  if (agreementHasRates(driverAgreement)) return driverAgreement;
  if (agreementHasRates(companyDefault)) return companyDefault;
  return null;
}

function isAirportRoute(from, to) {
  const text = `${from || ""} ${to || ""}`;
  return /\b(mia|airport)\b/i.test(text);
}

function isSkidType(type) {
  return type === "Loose" || type === "Skid";
}

function classifyJob(job) {
  if (isAirportRoute(job && job.from, job && job.to)) return "airport";
  if (isSkidType(job && job.type)) return "skid";
  if (ULD_TYPES.has(job && job.type)) return "uld";
  return "uld";
}

function unitKind(type) {
  return isSkidType(type) ? "skid" : "uld";
}

function minutesOfDay(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clockInWindow(minutes, start, end) {
  if (minutes == null || start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function isAfterHours(pickupTime, extras) {
  const minutes = minutesOfDay(pickupTime);
  const start = minutesOfDay(extras.afterHoursStart) ?? 22 * 60;
  const end = minutesOfDay(extras.afterHoursEnd) ?? 6 * 60;
  return clockInWindow(minutes, start, end);
}

function emptyOffer(tripType) {
  return {
    amount: null,
    currency: "USD",
    status: "unset",
    source: "unset",
    breakdown: [],
    tripType: tripType || null,
    waitFreeMinutes: null,
    waitPer15Min: null,
  };
}

function offerForDriver(driverAgreement, companyDefault, job, override) {
  const tripType = classifyJob(job || {});
  if (override && rateOrNull(override.amount) != null) {
    const amount = rateOrNull(override.amount);
    return {
      amount,
      currency: "USD",
      status: "quoted",
      source: "override",
      breakdown: [{ label: "Set by dispatch", amount }],
      tripType,
      waitFreeMinutes: null,
      waitPer15Min: null,
    };
  }

  const agreement = resolveAgreement(driverAgreement, companyDefault);
  if (!agreement) return emptyOffer(tripType);

  const parts = [];
  const percent = rateOrNull(agreement.percentOfQuote);
  const quote = job && typeof job.quotedAmount === "number" ? job.quotedAmount : null;
  if (percent != null && quote != null && quote > 0) {
    parts.push({ label: "Trip pay", amount: roundMoney((quote * percent) / 100) });
  }

  const flat = agreement.flatByType || {};
  const flatAmount =
    tripType === "airport" ? rateOrNull(flat.airport) : tripType === "skid" ? rateOrNull(flat.skid) : rateOrNull(flat.uld);
  if (flatAmount != null) {
    const label = tripType === "airport" ? "Airport transfer" : tripType === "skid" ? "Skid / loose" : "ULD / BUP";
    parts.push({ label, amount: flatAmount });
  }

  if (rateOrNull(agreement.base) != null) parts.push({ label: "Base", amount: rateOrNull(agreement.base) });
  if (rateOrNull(agreement.perMile) != null && job && typeof job.miles === "number") {
    const milesLabel = job.milesApproximate ? `${job.miles} mi, approximate` : `${job.miles} mi`;
    parts.push({ label: `Mileage (${milesLabel})`, amount: roundMoney(agreement.perMile * job.miles) });
  }

  const qty = Math.max(0, Number(job && job.qtyPieces) || 0);
  const units = unitKind(job && job.type);
  if (units === "uld" && rateOrNull(agreement.perUld) != null && qty > 0) {
    parts.push({ label: qty === 1 ? "1 ULD" : `${qty} ULDs`, amount: roundMoney(agreement.perUld * qty) });
  }
  if (units === "skid" && rateOrNull(agreement.perSkid) != null && qty > 0) {
    parts.push({ label: qty === 1 ? "1 skid" : `${qty} skids`, amount: roundMoney(agreement.perSkid * qty) });
  }

  const extras = agreement.extras || {};
  if (job && job.hazmat === true && rateOrNull(extras.hazmat) != null) {
    parts.push({ label: "Hazmat", amount: rateOrNull(extras.hazmat) });
  }
  if (rateOrNull(extras.afterHours) != null && isAfterHours(job && job.pickupTime, extras)) {
    parts.push({ label: "After hours", amount: rateOrNull(extras.afterHours) });
  }

  const waitPer15 = rateOrNull(extras.waitPer15Min);
  const waitFree = rateOrNull(extras.waitFreeMinutes) ?? 0;
  if (waitPer15 != null && job && typeof job.minutesWaiting === "number") {
    const blocks = Math.ceil(Math.max(0, job.minutesWaiting - waitFree) / 15);
    if (blocks > 0) {
      parts.push({ label: `Wait (${blocks} × 15 min)`, amount: roundMoney(blocks * waitPer15) });
    }
  }

  if (parts.length === 0) return emptyOffer(tripType);
  return {
    amount: roundMoney(parts.reduce((sum, part) => sum + part.amount, 0)),
    currency: "USD",
    status: "quoted",
    source: "rule",
    breakdown: parts,
    tripType,
    waitFreeMinutes: waitPer15 != null ? waitFree : null,
    waitPer15Min: waitPer15,
  };
}

function publicOffer(offer) {
  const quoted = offer && offer.status === "quoted" && typeof offer.amount === "number";
  return {
    amount: quoted ? offer.amount : null,
    currency: "USD",
    status: quoted ? "quoted" : "unset",
    source: quoted ? offer.source : "unset",
    breakdown: quoted ? offer.breakdown.map((part) => ({ label: part.label, amount: part.amount })) : [],
    tripType: offer ? offer.tripType : null,
  };
}

function cleanAgreement(input) {
  const source = input && typeof input === "object" ? input : {};
  const percent = rateOrNull(source.percentOfQuote);
  const flat = source.flatByType || {};
  const extras = source.extras || {};
  return {
    percentOfQuote: percent != null && percent <= 100 ? percent : null,
    flatByType: {
      uld: rateOrNull(flat.uld),
      skid: rateOrNull(flat.skid),
      airport: rateOrNull(flat.airport),
    },
    base: rateOrNull(source.base),
    perMile: rateOrNull(source.perMile),
    perUld: rateOrNull(source.perUld),
    perSkid: rateOrNull(source.perSkid),
    extras: {
      waitFreeMinutes: rateOrNull(extras.waitFreeMinutes),
      waitPer15Min: rateOrNull(extras.waitPer15Min),
      hazmat: rateOrNull(extras.hazmat),
      afterHours: rateOrNull(extras.afterHours),
      afterHoursStart: typeof extras.afterHoursStart === "string" ? extras.afterHoursStart.slice(0, 5) : "",
      afterHoursEnd: typeof extras.afterHoursEnd === "string" ? extras.afterHoursEnd.slice(0, 5) : "",
    },
  };
}

function jobFromRequest(req, line, route, extra) {
  return {
    quotedAmount: req && typeof req.quotedAmount === "number" ? req.quotedAmount : null,
    from: req && req.from,
    to: req && req.to,
    pickupTime: req && req.pickupTime,
    type: line && line.type,
    qtyPieces: line && line.qtyPieces,
    hazmat: !!(line && line.hazmat),
    miles: route && typeof route.miles === "number" ? route.miles : null,
    milesApproximate: !!(route && route.approximate),
    ...(extra || {}),
  };
}

function zonedParts(ms, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// Minutes the driver waited past the scheduled pickup, in Miami time.
function minutesPastPickup(tripDate, pickupTime, arrivedAtMs) {
  const scheduled = minutesOfDay(pickupTime);
  if (!tripDate || scheduled == null || typeof arrivedAtMs !== "number") return 0;
  const arrived = zonedParts(arrivedAtMs);
  if (arrived.date !== tripDate) {
    if (arrived.date < tripDate) return 0;
    return 24 * 60 - scheduled + arrived.minutes;
  }
  return Math.max(0, arrived.minutes - scheduled);
}

module.exports = {
  TIME_ZONE,
  agreementHasRates,
  resolveAgreement,
  classifyJob,
  offerForDriver,
  publicOffer,
  cleanAgreement,
  jobFromRequest,
  minutesPastPickup,
  roundMoney,
};
