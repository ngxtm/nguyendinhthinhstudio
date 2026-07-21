-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Existing deployments predate Prisma Migrate. Record this baseline as a
-- guarded no-op only when every historical table is already present; reject a
-- partial legacy schema instead of silently inventing it.
DO $baseline$
DECLARE
    baseline_tables CONSTANT TEXT[] := ARRAY[
        'Category',
        'Album',
        'Image',
        'Tag',
        'AlbumTag',
        'Profile',
        'UserFavorite',
        'Coupon',
        'UserCoupon',
        'Booking',
        'PaymentOrder'
    ];
    table_name TEXT;
BEGIN
    IF to_regclass('"Album"') IS NOT NULL THEN
        FOREACH table_name IN ARRAY baseline_tables LOOP
            IF to_regclass(format('%I', table_name)) IS NULL THEN
                RAISE EXCEPTION
                    'legacy baseline is partial: table % is missing',
                    table_name;
            END IF;
        END LOOP;
        RETURN;
    END IF;

    FOREACH table_name IN ARRAY baseline_tables LOOP
        IF to_regclass(format('%I', table_name)) IS NOT NULL THEN
            RAISE EXCEPTION
                'legacy baseline is partial: table % exists without Album',
                table_name;
        END IF;
    END LOOP;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shootDate" DATE,
    "categoryId" TEXT,
    "coverImageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "googleDriveLink" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "cloudflareImageId" TEXT,
    "uploadStatus" TEXT NOT NULL DEFAULT 'pending',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "smallUrl" TEXT NOT NULL DEFAULT '',
    "mediumUrl" TEXT NOT NULL DEFAULT '',
    "largeUrl" TEXT NOT NULL DEFAULT '',
    "xlargeUrl" TEXT NOT NULL DEFAULT '',
    "altText" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumTag" (
    "albumId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "AlbumTag_pkey" PRIMARY KEY ("albumId","tagId")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "isUsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "bookingDate" DATE NOT NULL,
    "sessionType" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "albumId" TEXT,
    "depositAmount" DECIMAL(10,2),
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "userId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Album_slug_key" ON "Album"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Album_coverImageId_key" ON "Album"("coverImageId");

-- CreateIndex
CREATE INDEX "Album_categoryId_idx" ON "Album"("categoryId");

-- CreateIndex
CREATE INDEX "Album_status_publishedAt_idx" ON "Album"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Album_isFeatured_featuredOrder_idx" ON "Album"("isFeatured", "featuredOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Image_cloudflareImageId_key" ON "Image"("cloudflareImageId");

-- CreateIndex
CREATE INDEX "Image_albumId_orderIndex_idx" ON "Image"("albumId", "orderIndex");

-- CreateIndex
CREATE INDEX "Image_uploadStatus_idx" ON "Image"("uploadStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "AlbumTag_albumId_idx" ON "AlbumTag"("albumId");

-- CreateIndex
CREATE INDEX "AlbumTag_tagId_idx" ON "AlbumTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "Profile"("email");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_idx" ON "UserFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_imageId_key" ON "UserFavorite"("userId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_isActive_validUntil_idx" ON "Coupon"("isActive", "validUntil");

-- CreateIndex
CREATE INDEX "UserCoupon_userId_isUsed_idx" ON "UserCoupon"("userId", "isUsed");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoupon_userId_couponId_key" ON "UserCoupon"("userId", "couponId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_bookingDate_idx" ON "Booking"("bookingDate" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_bookingId_idx" ON "PaymentOrder"("bookingId");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumTag" ADD CONSTRAINT "AlbumTag_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumTag" ADD CONSTRAINT "AlbumTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

END
$baseline$;
