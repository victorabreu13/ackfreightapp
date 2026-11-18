-- The providers go by their full names, which are the ones the Trucker fields suggest. The shorter names they went by
-- stay in their aliases, so a trucker written either way is still recognised.
UPDATE "AcctProvider" SET "name" = 'ACK TEAM LLC', "aliases" = 'ACK TEAM, ACK LOGISTICS' WHERE "name" = 'ACK Team LLC';
UPDATE "AcctProvider" SET "name" = 'RL SERVICES & TRANSPORT LLC', "aliases" = 'RL SERVICES, R&L SERVICES, RL SERVICE' WHERE "name" = 'RL Services';
UPDATE "AcctShipment" SET "pickupProvider" = 'ACK TEAM LLC' WHERE "pickupProvider" = 'ACK Team LLC';
UPDATE "AcctShipment" SET "transferProvider" = 'ACK TEAM LLC' WHERE "transferProvider" = 'ACK Team LLC';
UPDATE "AcctShipment" SET "pickupProvider" = 'RL SERVICES & TRANSPORT LLC' WHERE "pickupProvider" = 'RL Services';
UPDATE "AcctShipment" SET "transferProvider" = 'RL SERVICES & TRANSPORT LLC' WHERE "transferProvider" = 'RL Services';
