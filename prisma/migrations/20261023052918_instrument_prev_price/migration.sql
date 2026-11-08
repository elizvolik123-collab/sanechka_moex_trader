-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "prevPrice" DECIMAL(24,9),
ADD COLUMN     "prevPriceDate" DATE;
