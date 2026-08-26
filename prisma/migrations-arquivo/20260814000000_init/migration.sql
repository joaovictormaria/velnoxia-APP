-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('PIZZA', 'SIMPLE');

-- CreateEnum
CREATE TYPE "SizeLabel" AS ENUM ('BROTINHO', 'MEDIA', 'GRANDE', 'GIGANTE');

-- CreateEnum
CREATE TYPE "HalfPizzaPricingRule" AS ENUM ('HIGHEST_PRICE', 'AVERAGE_PRICE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('SITE', 'WHATSAPP', 'PHONE', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatusAuthorType" AS ENUM ('ADMIN', 'SYSTEM', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ReviewChannel" AS ENUM ('GOOGLE', 'WHATSAPP', 'SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RESPONDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_ORDER', 'ORDER_CANCELLED', 'NEW_REVIEW');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "storeName" TEXT NOT NULL DEFAULT 'Bella Pizza',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#E11D2E',
    "whatsappNumber" TEXT NOT NULL,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZipCode" TEXT,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "freeDeliveryMinOrder" DOUBLE PRECISION,
    "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "storeSettingsId" TEXT NOT NULL DEFAULT 'singleton',
    "weekday" "Weekday" NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TEXT NOT NULL DEFAULT '18:00',
    "closesAt" TEXT NOT NULL DEFAULT '23:30',

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPhoto" (
    "id" TEXT NOT NULL,
    "storeSettingsId" TEXT NOT NULL DEFAULT 'singleton',
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "imageUrl" TEXT,
    "kind" "CategoryKind" NOT NULL DEFAULT 'SIMPLE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "tag" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowHalfAndHalf" BOOLEAN NOT NULL DEFAULT false,
    "halfPizzaPricingRule" "HalfPizzaPricingRule" NOT NULL DEFAULT 'HIGHEST_PRICE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSize" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" "SizeLabel" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minOrderValue" DOUBLE PRECISION,
    "maxUsage" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'DELIVERY',
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "source" "OrderSource" NOT NULL DEFAULT 'SITE',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
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
    "estimatedDeliveryAt" TIMESTAMP(3),
    "autoPrintRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "sizeLabel" "SizeLabel",
    "isHalfAndHalf" BOOLEAN NOT NULL DEFAULT false,
    "secondProductId" TEXT,
    "secondProductNameSnapshot" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemExtra" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "extraId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceSnapshot" DOUBLE PRECISION NOT NULL,

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
    "customerId" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "channel" "ReviewChannel" NOT NULL DEFAULT 'SITE',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
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
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedOrderId" TEXT,
    "relatedReviewId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_storeSettingsId_weekday_key" ON "OpeningHour"("storeSettingsId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSize_productId_size_key" ON "ProductSize"("productId", "size");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_isRead_createdAt_idx" ON "Notification"("isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_storeSettingsId_fkey" FOREIGN KEY ("storeSettingsId") REFERENCES "StoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPhoto" ADD CONSTRAINT "RestaurantPhoto_storeSettingsId_fkey" FOREIGN KEY ("storeSettingsId") REFERENCES "StoreSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "Extra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_respondedByAdminId_fkey" FOREIGN KEY ("respondedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

