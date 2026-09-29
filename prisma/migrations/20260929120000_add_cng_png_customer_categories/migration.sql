-- AlterEnum: add CNG and PNG customer categories
ALTER TYPE "CustomerCategory" ADD VALUE IF NOT EXISTS 'CNG';
ALTER TYPE "CustomerCategory" ADD VALUE IF NOT EXISTS 'PNG';
