-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('POWER_USER', 'MANAGED_USER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "passwordVersion" INTEGER NOT NULL DEFAULT 1,
    "role" "UserRole" NOT NULL DEFAULT 'POWER_USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "managedBy" TEXT,
    "onboardingState" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "powerUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "downloadUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "revertibleUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compound" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iupacName" TEXT,
    "synonyms" TEXT[],
    "mechanismOfAction" TEXT,
    "administrationRoutes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Compound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundProfile" (
    "id" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "dosingLow" JSONB NOT NULL,
    "dosingTypical" JSONB NOT NULL,
    "dosingHigh" JSONB NOT NULL,
    "sideEffects" TEXT,
    "stackingNotes" TEXT,

    CONSTRAINT "CompoundProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "doi" TEXT,
    "pmid" TEXT,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "cycleId" TEXT,
    "dose" JSONB NOT NULL,
    "schedule" JSONB NOT NULL,
    "administrationRoute" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseLog" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vialId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "amount" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "injectionSite" JSONB,
    "isBatchLog" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "loggedByUserId" TEXT,

    CONSTRAINT "DoseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallRating" INTEGER NOT NULL,
    "tags" TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolRating" (
    "id" TEXT NOT NULL,
    "outcomeLogId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "ProtocolRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "totalMg" DECIMAL(10,3) NOT NULL,
    "bacWaterMl" DECIMAL(10,3),
    "remainingMg" DECIMAL(10,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRY',
    "reconstitutedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Vial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "telegramUsername" TEXT NOT NULL,
    "messageTemplate" TEXT,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProduct" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VendorProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sendMethod" TEXT,
    "paymentConfirmation" JSONB,
    "telegramMessageId" TEXT,
    "messageText" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "staleFlaggedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "compoundId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "vialSizeMg" DECIMAL(10,3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2),
    "unitCurrency" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionString" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pushPermissionState" TEXT NOT NULL DEFAULT 'NOT_PROMPTED',
    "emailFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "metadata" JSONB,
    "oldValues" JSONB,
    "newValues" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_managedBy_idx" ON "User"("managedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key" ON "AccountDeletionRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeRequest_tokenHash_key" ON "EmailChangeRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_userId_status_idx" ON "EmailChangeRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Compound_name_key" ON "Compound"("name");

-- CreateIndex
CREATE INDEX "Compound_status_idx" ON "Compound"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompoundProfile_compoundId_key" ON "CompoundProfile"("compoundId");

-- CreateIndex
CREATE INDEX "Protocol_userId_status_idx" ON "Protocol"("userId", "status");

-- CreateIndex
CREATE INDEX "Cycle_userId_idx" ON "Cycle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoseLog_idempotencyKey_key" ON "DoseLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DoseLog_userId_scheduledDate_idx" ON "DoseLog"("userId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "DoseLog_userId_protocolId_scheduledDate_key" ON "DoseLog"("userId", "protocolId", "scheduledDate");

-- CreateIndex
CREATE INDEX "OutcomeLog_userId_scheduledDate_idx" ON "OutcomeLog"("userId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeLog_userId_scheduledDate_key" ON "OutcomeLog"("userId", "scheduledDate");

-- CreateIndex
CREATE INDEX "ProtocolRating_protocolId_idx" ON "ProtocolRating"("protocolId");

-- CreateIndex
CREATE INDEX "Vial_userId_compoundId_status_idx" ON "Vial"("userId", "compoundId", "status");

-- CreateIndex
CREATE INDEX "Vendor_userId_status_idx" ON "Vendor"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_userId_telegramUsername_key" ON "Vendor"("userId", "telegramUsername");

-- CreateIndex
CREATE INDEX "VendorProduct_vendorId_inStock_idx" ON "VendorProduct"("vendorId", "inStock");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_status_sentAt_idx" ON "Order"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_compoundId_form_vialSizeMg_key" ON "OrderItem"("orderId", "compoundId", "form", "vialSizeMg");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSession_userId_key" ON "TelegramSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderPreference_userId_key" ON "ReminderPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectUserId_idx" ON "AuditEvent"("subjectUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_category_timestamp_idx" ON "AuditEvent"("category", "timestamp");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedBy_fkey" FOREIGN KEY ("managedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_powerUserId_fkey" FOREIGN KEY ("powerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundProfile" ADD CONSTRAINT "CompoundProfile_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CompoundProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseLog" ADD CONSTRAINT "DoseLog_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseLog" ADD CONSTRAINT "DoseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseLog" ADD CONSTRAINT "DoseLog_vialId_fkey" FOREIGN KEY ("vialId") REFERENCES "Vial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeLog" ADD CONSTRAINT "OutcomeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolRating" ADD CONSTRAINT "ProtocolRating_outcomeLogId_fkey" FOREIGN KEY ("outcomeLogId") REFERENCES "OutcomeLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vial" ADD CONSTRAINT "Vial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vial" ADD CONSTRAINT "Vial_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vial" ADD CONSTRAINT "Vial_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "VendorProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSession" ADD CONSTRAINT "TelegramSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

