-- Avianca stock (prefix 729) is ACK stock in Kope. The airline list, guía prefix
-- picker, and AWB stock page read this table.
INSERT INTO "AirlinePrefix" ("prefix", "airline", "iata", "trackingUrlTemplate", "parserType", "notes", "updatedAt")
VALUES ('729', 'Avianca', 'AV', NULL, 'none', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("prefix") DO NOTHING;
