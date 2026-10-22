-- Operations replaces the old team role. Viewer is read-only.
ALTER TYPE "Role" RENAME VALUE 'TEAM' TO 'OPERATIONS';
ALTER TYPE "Role" ADD VALUE 'VIEWER';

-- Seed the ACK bookkeeper. ACCOUNTING already exists, so this does not use the new enum value.
INSERT INTO "User" (
    "id",
    "email",
    "name",
    "role",
    "authProvider",
    "accountingAgentKey",
    "active",
    "createdAt",
    "updatedAt"
) VALUES (
    'user_xiomara_viloria',
    'xiomara.viloria@ackfreight.com',
    'Xiomara Viloria',
    'ACCOUNTING',
    'google',
    'ack',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
    "role" = EXCLUDED."role",
    "accountingAgentKey" = EXCLUDED."accountingAgentKey",
    "active" = true,
    "name" = COALESCE("User"."name", EXCLUDED."name"),
    "updatedAt" = CURRENT_TIMESTAMP;
