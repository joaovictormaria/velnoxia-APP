-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'COURIER');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('PIZZA', 'SIMPLE');

-- CreateEnum
CREATE TYPE "HalfPizzaPricingRule" AS ENUM ('HIGHEST_PRICE', 'AVERAGE_PRICE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "EmployeeBenefitType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "EmployeeLimitMode" AS ENUM ('NONE', 'ITEMS_PER_DAY', 'AMOUNT_PER_DAY', 'PER_CATEGORY');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'TABLE_READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'PAYROLL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('SITE', 'WHATSAPP', 'PHONE', 'ADMIN');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StatusAuthorType" AS ENUM ('ADMIN', 'SYSTEM', 'CUSTOMER', 'COURIER');

-- CreateEnum
CREATE TYPE "ReviewChannel" AS ENUM ('GOOGLE', 'WHATSAPP', 'SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RESPONDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_ORDER', 'ORDER_CANCELLED', 'NEW_REVIEW');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "InventoryUnitSystem" AS ENUM ('WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'RESERVATION', 'CONSUMPTION', 'PRODUCTION', 'LOSS', 'ADJUSTMENT', 'RETURN', 'REVERSAL');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'pizzaria',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" VARCHAR(14),
    "documentType" "DocumentType",
    "status" "StoreStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    "paidUntil" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionDevice" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceTokenHash" TEXT NOT NULL,
    "requiresPin" BOOLEAN NOT NULL DEFAULT true,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT 'Bella Pizza',
    "tagline" TEXT,
    "heroSubtitle" TEXT,
    "aboutEyebrow" TEXT,
    "aboutTitle" TEXT,
    "aboutBody" TEXT,
    "aboutImageUrl" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#E11D2E',
    "colorMode" TEXT NOT NULL DEFAULT 'GRADIENT',
    "secondaryColor" TEXT,
    "tertiaryColor" TEXT,
    "whatsappNumber" TEXT NOT NULL,
    "email" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "tiktokUrl" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZipCode" TEXT,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 6,
    "freeDeliveryMinOrder" DECIMAL(10,2),
    "minOrderValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimatedDeliveryMinMin" INTEGER NOT NULL DEFAULT 35,
    "estimatedDeliveryMinMax" INTEGER NOT NULL DEFAULT 55,
    "estimatedPickupMinMin" INTEGER NOT NULL DEFAULT 15,
    "estimatedPickupMinMax" INTEGER NOT NULL DEFAULT 25,
    "acceptsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptsPickup" BOOLEAN NOT NULL DEFAULT true,
    "acceptedPaymentMethods" "PaymentMethod"[] DEFAULT ARRAY['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH']::"PaymentMethod"[],
    "autoPrintEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL,
    "storeSettingsId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TEXT NOT NULL DEFAULT '18:00',
    "closesAt" TEXT NOT NULL DEFAULT '23:30',

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPhoto" (
    "id" TEXT NOT NULL,
    "storeSettingsId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "badge" TEXT,
    "headline" TEXT,
    "subhead" TEXT,
    "icon" TEXT,
    "imageUrl" TEXT,
    "kind" "CategoryKind" NOT NULL DEFAULT 'SIMPLE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT,
    "tag" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowHalfAndHalf" BOOLEAN NOT NULL DEFAULT false,
    "halfPizzaPricingRule" "HalfPizzaPricingRule" NOT NULL DEFAULT 'HIGHEST_PRICE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySize" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategorySize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "minChoices" INTEGER NOT NULL DEFAULT 0,
    "maxChoices" INTEGER NOT NULL DEFAULT 1,
    "freeChoices" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSize" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categorySizeId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraScope" (
    "id" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,

    CONSTRAINT "ExtraScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "minOrderValue" DECIMAL(10,2),
    "maxUsage" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "eyebrow" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discount" TEXT,
    "price" DECIMAL(10,2),
    "originalPrice" DECIMAL(10,2),
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "planId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBenefitPlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultType" "EmployeeBenefitType" NOT NULL DEFAULT 'NONE',
    "defaultValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "limitMode" "EmployeeLimitMode" NOT NULL DEFAULT 'NONE',
    "limitValue" DECIMAL(10,2),
    "allowPayroll" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBenefitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBenefitRule" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "type" "EmployeeBenefitType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER,

    CONSTRAINT "EmployeeBenefitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "trackingToken" TEXT,
    "courierId" TEXT,
    "courierNameSnapshot" TEXT,
    "employeeId" TEXT,
    "employeeNameSnapshot" TEXT,
    "employeeDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "employeeBenefitNote" TEXT,
    "awaitingCourierSince" TIMESTAMP(3),
    "type" "OrderType" NOT NULL DEFAULT 'DELIVERY',
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "source" "OrderSource" NOT NULL DEFAULT 'SITE',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(65,30) NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "refund" DECIMAL(10,2),
    "refundedAt" TIMESTAMP(3),
    "couponId" TEXT,
    "deliveryStreet" TEXT,
    "deliveryNumber" TEXT,
    "deliveryComplement" TEXT,
    "deliveryNeighborhood" TEXT,
    "deliveryCity" TEXT,
    "deliveryState" TEXT,
    "deliveryZipCode" TEXT,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "tableId" TEXT,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "autoPrintRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "sizeLabel" TEXT,
    "isHalfAndHalf" BOOLEAN NOT NULL DEFAULT false,
    "secondProductId" TEXT,
    "secondProductNameSnapshot" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "employeeDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "benefitQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemExtra" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "extraId" TEXT,
    "optionItemId" TEXT,
    "groupNameSnapshot" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceSnapshot" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItemExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "authorType" "StatusAuthorType" NOT NULL DEFAULT 'SYSTEM',
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "channel" "ReviewChannel" NOT NULL DEFAULT 'SITE',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "visitorId" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedOrderId" TEXT,
    "relatedReviewId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLike" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierLocation" (
    "courierId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierLocation_pkey" PRIMARY KEY ("courierId")
);

-- CreateTable
CREATE TABLE "CourierInvite" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system" "InventoryUnitSystem" NOT NULL,
    "description" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnitConversion" (
    "id" TEXT NOT NULL,
    "fromUnitId" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(15,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'INGREDIENT',
    "baseUnitId" TEXT NOT NULL,
    "contentSize" DECIMAL(15,4),
    "contentUnit" TEXT,
    "quantityOnHand" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "maximumQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,2),
    "minimumThreshold" DECIMAL(15,4),
    "idealQuantity" DECIMAL(15,4),
    "maximumCapacity" DECIMAL(15,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitId" TEXT NOT NULL,
    "reference" TEXT,
    "referenceType" TEXT,
    "originalMovementId" TEXT,
    "compositionId" TEXT,
    "costAtTime" DECIMAL(10,2),
    "note" TEXT,
    "authorType" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductComposition" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductComposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositionItem" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "qrcodeUrl" TEXT NOT NULL,
    "qrcodeData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "orderId" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "storeId" TEXT,
    "payload" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_document_key" ON "Store"("document");

-- CreateIndex
CREATE UNIQUE INDEX "Store_stripeCustomerId_key" ON "Store"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_stripeSubscriptionId_key" ON "Store"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- CreateIndex
CREATE INDEX "TableSession_storeId_status_idx" ON "TableSession"("storeId", "status");

-- CreateIndex
CREATE INDEX "TableSession_storeId_expiresAt_idx" ON "TableSession"("storeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_tableId_status_key" ON "TableSession"("tableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SessionDevice_deviceTokenHash_key" ON "SessionDevice"("deviceTokenHash");

-- CreateIndex
CREATE INDEX "SessionDevice_sessionId_revokedAt_idx" ON "SessionDevice"("sessionId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionDevice_sessionId_deviceTokenHash_key" ON "SessionDevice"("sessionId", "deviceTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_storeId_idx" ON "AdminUser"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_storeId_key" ON "StoreSettings"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_storeSettingsId_weekday_key" ON "OpeningHour"("storeSettingsId", "weekday");

-- CreateIndex
CREATE INDEX "Category_storeId_sortOrder_deletedAt_idx" ON "Category"("storeId", "sortOrder", "deletedAt");

-- CreateIndex
CREATE INDEX "Category_deletedAt_idx" ON "Category"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_deletedAt_idx" ON "Product"("categoryId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_storeId_isActive_deletedAt_idx" ON "Product"("storeId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_inventoryItemId_idx" ON "Product"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");

-- CreateIndex
CREATE INDEX "CategorySize_categoryId_sortOrder_idx" ON "CategorySize"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySize_categoryId_label_key" ON "CategorySize"("categoryId", "label");

-- CreateIndex
CREATE INDEX "OptionGroup_categoryId_sortOrder_idx" ON "OptionGroup"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "OptionGroup_productId_sortOrder_idx" ON "OptionGroup"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "OptionItem_groupId_sortOrder_idx" ON "OptionItem"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OptionItem_groupId_name_key" ON "OptionItem"("groupId", "name");

-- CreateIndex
CREATE INDEX "ProductSize_categorySizeId_idx" ON "ProductSize"("categorySizeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSize_productId_categorySizeId_key" ON "ProductSize"("productId", "categorySizeId");

-- CreateIndex
CREATE INDEX "Extra_storeId_isActive_deletedAt_idx" ON "Extra"("storeId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Extra_deletedAt_idx" ON "Extra"("deletedAt");

-- CreateIndex
CREATE INDEX "ExtraScope_categoryId_idx" ON "ExtraScope"("categoryId");

-- CreateIndex
CREATE INDEX "ExtraScope_productId_idx" ON "ExtraScope"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraScope_extraId_categoryId_key" ON "ExtraScope"("extraId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraScope_extraId_productId_key" ON "ExtraScope"("extraId", "productId");

-- CreateIndex
CREATE INDEX "Coupon_isActive_deletedAt_idx" ON "Coupon"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Coupon_deletedAt_idx" ON "Coupon"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");

-- CreateIndex
CREATE INDEX "Promotion_storeId_isActive_sortOrder_deletedAt_idx" ON "Promotion"("storeId", "isActive", "sortOrder", "deletedAt");

-- CreateIndex
CREATE INDEX "Promotion_deletedAt_idx" ON "Promotion"("deletedAt");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");

-- CreateIndex
CREATE INDEX "Employee_storeId_isActive_deletedAt_idx" ON "Employee"("storeId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_storeId_phone_key" ON "Employee"("storeId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBenefitPlan_storeId_name_key" ON "EmployeeBenefitPlan"("storeId", "name");

-- CreateIndex
CREATE INDEX "EmployeeBenefitRule_planId_idx" ON "EmployeeBenefitRule"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBenefitRule_planId_categoryId_key" ON "EmployeeBenefitRule"("planId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBenefitRule_planId_productId_key" ON "EmployeeBenefitRule"("planId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

-- CreateIndex
CREATE INDEX "Order_storeId_status_createdAt_deletedAt_idx" ON "Order"("storeId", "status", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_courierId_status_deletedAt_idx" ON "Order"("courierId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_employeeId_createdAt_deletedAt_idx" ON "Order"("employeeId", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_deletedAt_idx" ON "Order"("storeId", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_deletedAt_idx" ON "Order"("customerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_sessionId_deletedAt_idx" ON "Order"("sessionId", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_deviceId_deletedAt_idx" ON "Order"("deviceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_number_key" ON "Order"("storeId", "number");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_storeId_status_idx" ON "Review"("storeId", "status");

-- CreateIndex
CREATE INDEX "Review_storeId_createdAt_idx" ON "Review"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_storeId_isRead_createdAt_idx" ON "Notification"("storeId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewLike_reviewId_idx" ON "ReviewLike"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLike_reviewId_visitorId_key" ON "ReviewLike"("reviewId", "visitorId");

-- CreateIndex
CREATE INDEX "Post_storeId_publishedAt_idx" ON "Post"("storeId", "publishedAt");

-- CreateIndex
CREATE INDEX "PostLike_postId_idx" ON "PostLike"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_visitorId_key" ON "PostLike"("postId", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierInvite_codeHash_key" ON "CourierInvite"("codeHash");

-- CreateIndex
CREATE INDEX "CourierInvite_storeId_usedAt_idx" ON "CourierInvite"("storeId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_adminUserId_usedAt_idx" ON "PasswordResetToken"("adminUserId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnit_code_key" ON "InventoryUnit"("code");

-- CreateIndex
CREATE INDEX "InventoryUnit_system_idx" ON "InventoryUnit"("system");

-- CreateIndex
CREATE INDEX "InventoryUnitConversion_fromUnitId_idx" ON "InventoryUnitConversion"("fromUnitId");

-- CreateIndex
CREATE INDEX "InventoryUnitConversion_toUnitId_idx" ON "InventoryUnitConversion"("toUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnitConversion_fromUnitId_toUnitId_key" ON "InventoryUnitConversion"("fromUnitId", "toUnitId");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_itemType_idx" ON "InventoryItem"("storeId", "itemType");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_isActive_idx" ON "InventoryItem"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_createdAt_idx" ON "InventoryItem"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_storeId_sku_key" ON "InventoryItem"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_storeId_barcode_key" ON "InventoryItem"("storeId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_originalMovementId_key" ON "InventoryMovement"("originalMovementId");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_createdAt_idx" ON "InventoryMovement"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_itemId_idx" ON "InventoryMovement"("storeId", "itemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_type_idx" ON "InventoryMovement"("storeId", "type");

-- CreateIndex
CREATE INDEX "InventoryMovement_reference_idx" ON "InventoryMovement"("reference");

-- CreateIndex
CREATE INDEX "InventoryMovement_compositionId_idx" ON "InventoryMovement"("compositionId");

-- CreateIndex
CREATE INDEX "InventoryMovement_originalMovementId_idx" ON "InventoryMovement"("originalMovementId");

-- CreateIndex
CREATE INDEX "ProductComposition_productId_isActive_idx" ON "ProductComposition"("productId", "isActive");

-- CreateIndex
CREATE INDEX "ProductComposition_storeId_createdAt_idx" ON "ProductComposition"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComposition_productId_version_key" ON "ProductComposition"("productId", "version");

-- CreateIndex
CREATE INDEX "CompositionItem_compositionId_idx" ON "CompositionItem"("compositionId");

-- CreateIndex
CREATE INDEX "CompositionItem_inventoryItemId_idx" ON "CompositionItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Table_storeId_status_deletedAt_idx" ON "Table"("storeId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Table_storeId_createdAt_deletedAt_idx" ON "Table"("storeId", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Table_deletedAt_idx" ON "Table"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Table_storeId_number_key" ON "Table"("storeId", "number");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_action_createdAt_idx" ON "AuditLog"("storeId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_resource_resourceId_idx" ON "AuditLog"("storeId", "resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_webhookId_key" ON "PaymentWebhookEvent"("webhookId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_webhookId_idx" ON "PaymentWebhookEvent"("webhookId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_orderId_idx" ON "PaymentWebhookEvent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_status_idx" ON "PaymentWebhookEvent"("provider", "status");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_createdAt_idx" ON "PaymentWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventId_idx" ON "StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_storeId_idx" ON "StripeWebhookEvent"("storeId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_idx" ON "StripeWebhookEvent"("eventType");

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionDevice" ADD CONSTRAINT "SessionDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_storeSettingsId_fkey" FOREIGN KEY ("storeSettingsId") REFERENCES "StoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPhoto" ADD CONSTRAINT "RestaurantPhoto_storeSettingsId_fkey" FOREIGN KEY ("storeSettingsId") REFERENCES "StoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySize" ADD CONSTRAINT "CategorySize_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_categorySizeId_fkey" FOREIGN KEY ("categorySizeId") REFERENCES "CategorySize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extra" ADD CONSTRAINT "Extra_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraScope" ADD CONSTRAINT "ExtraScope_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "Extra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraScope" ADD CONSTRAINT "ExtraScope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraScope" ADD CONSTRAINT "ExtraScope_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EmployeeBenefitPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefitPlan" ADD CONSTRAINT "EmployeeBenefitPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefitRule" ADD CONSTRAINT "EmployeeBenefitRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EmployeeBenefitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefitRule" ADD CONSTRAINT "EmployeeBenefitRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefitRule" ADD CONSTRAINT "EmployeeBenefitRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SessionDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "Extra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_optionItemId_fkey" FOREIGN KEY ("optionItemId") REFERENCES "OptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_respondedByAdminId_fkey" FOREIGN KEY ("respondedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierLocation" ADD CONSTRAINT "CourierLocation_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierInvite" ADD CONSTRAINT "CourierInvite_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_originalMovementId_fkey" FOREIGN KEY ("originalMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComposition" ADD CONSTRAINT "ProductComposition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComposition" ADD CONSTRAINT "ProductComposition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECK que o Prisma nao sabe declarar no schema.prisma, e por isso vive aqui.
--
-- Se um dia esta migration for regerada a partir do schema, ESTE BLOCO PRECISA
-- SER RECOLOCADO A MAO — o gerador nao o reproduz.
--
-- Impede os tres estados incoerentes que a aplicacao sozinha nao garante:
--   1. document preenchido e documentType vazio (ou o contrario);
--   2. documentType dizendo CPF com 14 digitos, ou CNPJ com 11;
--   3. documento gravado com mascara ("123.456.789-09") ou com qualquer
--      caractere que nao seja digito.
--
-- O item 3 e o que transforma "guardar so numeros" de convencao em invariante:
-- sem ele, um caminho novo que esqueca de normalizar corrompe a unicidade em
-- silencio, porque "12345678909" e "123.456.789-09" sao valores diferentes.
--
-- Os `IS NOT NULL` explicitos nao sao redundancia, e foram acrescentados depois
-- que um teste pegou a falha: com document NULL e documentType = 'CPF', a
-- comparacao `NULL ~ regex` da NULL, o OR inteiro da NULL, e um CHECK que
-- resulta em NULL e ACEITO pelo Postgres — so FALSE rejeita. Sem esta guarda,
-- metade do par entrava no banco.
-- ---------------------------------------------------------------------------
ALTER TABLE "Store" ADD CONSTRAINT "Store_document_coerente"
  CHECK (
    ("document" IS NULL AND "documentType" IS NULL)
    OR (
      "document" IS NOT NULL AND "documentType" IS NOT NULL
      AND (
        ("documentType" = 'CPF'  AND "document" ~ '^[0-9]{11}$') OR
        ("documentType" = 'CNPJ' AND "document" ~ '^[0-9]{14}$')
      )
    )
  );
