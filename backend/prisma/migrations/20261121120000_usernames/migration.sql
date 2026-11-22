-- Accounts are identified by a username only (AUTH-1, AUTH-2): no email, no display name.

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(32);

-- Existing accounts get a username made from the local part of their email, cleaned to the
-- allowed characters. Duplicates get a suffix taken from the user id.
WITH cleaned AS (
    SELECT "id", "created_at",
           left(regexp_replace(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g'), '^[._-]+', ''), 24) AS "name"
    FROM "users"
), valid AS (
    SELECT "id", "created_at", CASE WHEN length("name") >= 3 THEN "name" ELSE 'user' || "name" END AS "name"
    FROM cleaned
), ranked AS (
    SELECT "id", "name", row_number() OVER (PARTITION BY "name" ORDER BY "created_at", "id") AS "n"
    FROM valid
)
UPDATE "users" AS u
SET "username" = CASE WHEN r."n" = 1 THEN r."name" ELSE r."name" || '-' || left(replace(u."id"::text, '-', ''), 6) END
FROM ranked AS r
WHERE r."id" = u."id";

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Raw SQL only (see the header of schema.prisma): lowercase letters, digits, dot, dash, underscore,
-- 3 to 32 characters, starting with a letter or a digit. The API normalizes input to lowercase.
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

DROP INDEX "users_email_key";
ALTER TABLE "users" DROP COLUMN "email", DROP COLUMN "display_name";
