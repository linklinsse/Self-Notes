-- NOTE-9: alphabetical sort of the notes grid.
-- Raw SQL only (see the header of schema.prisma): a generated column with an ICU collation, so
-- that case and accents sort naturally ("À faire", "apple", "Été", "Zèbre"). Untitled notes get
-- NULL, which the API sorts last.
ALTER TABLE "notes"
    ADD COLUMN "sort_title" TEXT COLLATE "und-x-icu" GENERATED ALWAYS AS (NULLIF(btrim("title"), '')) STORED;
