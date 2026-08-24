-- Preserve existing customer rows while renaming the category value.
ALTER TYPE "CustomerCategory" RENAME VALUE 'BULK' TO 'DRS';
