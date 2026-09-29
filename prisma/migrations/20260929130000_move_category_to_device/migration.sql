-- Move gas category ownership from customer records to individual meters.
-- Legacy INDUSTRIAL assignments remain uncategorized because the old value
-- does not identify whether a meter uses CNG or PNG.
CREATE TYPE "CustomerCategory_new" AS ENUM (
  'COMMERCIAL',
  'RESIDENTIAL',
  'DRS',
  'INDUSTRIAL_CNG',
  'INDUSTRIAL_PNG'
);

ALTER TABLE "Device" ADD COLUMN "category" "CustomerCategory_new";

UPDATE "Device" AS device
SET "category" = CASE customer."category"::text
  WHEN 'CNG' THEN 'INDUSTRIAL_CNG'::"CustomerCategory_new"
  WHEN 'PNG' THEN 'INDUSTRIAL_PNG'::"CustomerCategory_new"
  WHEN 'INDUSTRIAL' THEN NULL
  ELSE customer."category"::text::"CustomerCategory_new"
END
FROM "Customer" AS customer
WHERE device."customerId" = customer."id";

DROP INDEX IF EXISTS "Customer_category_idx";
ALTER TABLE "Customer" DROP COLUMN "category";
DROP TYPE "CustomerCategory";
ALTER TYPE "CustomerCategory_new" RENAME TO "CustomerCategory";

CREATE INDEX "Device_category_idx" ON "Device"("category");
