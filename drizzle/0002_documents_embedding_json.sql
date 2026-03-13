ALTER TABLE "documents"
ALTER COLUMN "embedding" TYPE jsonb
USING CASE
  WHEN "embedding" IS NULL THEN NULL
  ELSE ("embedding"::text)::jsonb
END;
