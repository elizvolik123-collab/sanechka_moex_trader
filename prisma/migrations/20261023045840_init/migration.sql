-- Триграммный поиск по инструментам и новостям
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('TINVEST', 'FINAM', 'ALOR', 'FILE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('FULL', 'INCREMENTAL', 'FILE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('SHARE', 'BOND', 'ETF', 'FUTURE', 'CURRENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "CashOpType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'COUPON', 'AMORTIZATION', 'VARMARGIN', 'TAX', 'FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "LegRole" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PLANNED', 'EXECUTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "depositRub" DECIMAL(20,2) NOT NULL DEFAULT 100000,
    "riskPct" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "rewardRatio" DECIMAL(6,2) NOT NULL DEFAULT 3,
    "commissionPct" DECIMAL(6,4) NOT NULL DEFAULT 0.05,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "broker" "BrokerType" NOT NULL,
    "label" TEXT NOT NULL,
    "tokenCipher" BYTEA,
    "tokenKeyVersion" INTEGER,
    "tokenLast4" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startingCapital" DECIMAL(20,2),
    "syncCursor" TEXT,
    "syncedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "options" JSONB NOT NULL,

    CONSTRAINT "ImportPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "secid" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "shortName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isin" TEXT,
    "figi" TEXT,
    "tinvestUid" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "lotSize" INTEGER NOT NULL,
    "minStep" DECIMAL(24,9) NOT NULL,
    "stepPrice" DECIMAL(24,9),
    "faceValue" DECIMAL(20,4),
    "initialMargin" DECIMAL(20,2),
    "expiresAt" TIMESTAMP(3),
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "logoName" TEXT,
    "logoPath" TEXT,
    "isTraded" BOOLEAN NOT NULL DEFAULT true,
    "specUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(24,9) NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "lots" DECIMAL(24,6) NOT NULL,
    "accruedInterest" DECIMAL(20,4),
    "brokerFee" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "exchangeFee" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashOperation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "externalId" TEXT NOT NULL,
    "type" "CashOpType" NOT NULL,
    "amountRub" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "CashOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "closedDateMsk" DATE NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "lots" DECIMAL(24,6) NOT NULL,
    "avgEntry" DECIMAL(24,9) NOT NULL,
    "avgExit" DECIMAL(24,9) NOT NULL,
    "fees" DECIMAL(20,4) NOT NULL,
    "grossPnl" DECIMAL(20,4) NOT NULL,
    "netPnl" DECIMAL(20,4) NOT NULL,
    "returnPct" DECIMAL(12,6) NOT NULL,
    "holdingSec" INTEGER NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLeg" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "role" "LegRole" NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "feeShare" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "TradeLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "depositRub" DECIMAL(20,2) NOT NULL,
    "riskPct" DECIMAL(6,3) NOT NULL,
    "entryPrice" DECIMAL(24,9) NOT NULL,
    "stopPrice" DECIMAL(24,9) NOT NULL,
    "takePrice" DECIMAL(24,9) NOT NULL,
    "rewardRatio" DECIMAL(6,2) NOT NULL,
    "lots" INTEGER NOT NULL,
    "riskRub" DECIMAL(20,2) NOT NULL,
    "profitRub" DECIMAL(20,2) NOT NULL,
    "feesRub" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tickers" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "storedPath" TEXT,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "NewsMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_providerId_accountId_key" ON "AuthAccount"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "BrokerConnection_userId_idx" ON "BrokerConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAccount_connectionId_externalId_key" ON "BrokerAccount"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "SyncRun_connectionId_startedAt_idx" ON "SyncRun"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "ImportPreset_userId_idx" ON "ImportPreset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_figi_key" ON "Instrument"("figi");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_tinvestUid_key" ON "Instrument"("tinvestUid");

-- CreateIndex
CREATE INDEX "Instrument_secid_idx" ON "Instrument"("secid");

-- CreateIndex
CREATE INDEX "Instrument_search_trgm_idx" ON "Instrument" USING GIN ("secid" gin_trgm_ops, "shortName" gin_trgm_ops, "name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_secid_board_key" ON "Instrument"("secid", "board");

-- CreateIndex
CREATE INDEX "Execution_accountId_instrumentId_executedAt_idx" ON "Execution"("accountId", "instrumentId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_accountId_externalId_key" ON "Execution"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "CashOperation_accountId_occurredAt_idx" ON "CashOperation"("accountId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashOperation_accountId_externalId_key" ON "CashOperation"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "Trade_accountId_closedAt_idx" ON "Trade"("accountId", "closedAt");

-- CreateIndex
CREATE INDEX "Trade_accountId_instrumentId_closedAt_idx" ON "Trade"("accountId", "instrumentId", "closedAt");

-- CreateIndex
CREATE INDEX "TradeLeg_tradeId_idx" ON "TradeLeg"("tradeId");

-- CreateIndex
CREATE INDEX "TradeLeg_executionId_idx" ON "TradeLeg"("executionId");

-- CreateIndex
CREATE INDEX "TradePlan_userId_createdAt_idx" ON "TradePlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsPost_publishedAt_idx" ON "NewsPost"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsPost_text_trgm_idx" ON "NewsPost" USING GIN ("text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "NewsPost_channel_messageId_key" ON "NewsPost"("channel", "messageId");

-- CreateIndex
CREATE INDEX "NewsMedia_postId_idx" ON "NewsMedia"("postId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerConnection" ADD CONSTRAINT "BrokerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BrokerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BrokerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportPreset" ADD CONSTRAINT "ImportPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLeg" ADD CONSTRAINT "TradeLeg_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLeg" ADD CONSTRAINT "TradeLeg_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsMedia" ADD CONSTRAINT "NewsMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
