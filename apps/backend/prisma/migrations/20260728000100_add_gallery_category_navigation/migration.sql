ALTER TABLE "Category"
ADD COLUMN "showInNavigation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "navigationOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Category_showInNavigation_navigationOrder_idx"
ON "Category"("showInNavigation", "navigationOrder");

INSERT INTO "Category" (
  "id", "name", "slug", "description", "parentId",
  "showInNavigation", "navigationOrder", "createdAt", "updatedAt"
)
VALUES
  ('gallery-category-collection', 'Collection', 'collection', 'Các bộ sưu tập ảnh được tuyển chọn của NDT Studio.', NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-nu', 'Nữ', 'nu', 'Các album chân dung nữ của NDT Studio.', NULL, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-nam', 'Nam', 'nam', 'Các album chân dung nam của NDT Studio.', NULL, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-standard', 'Standard', 'standard', 'Các album thuộc dòng Standard.', NULL, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-bts', 'BTS Hậu Trường', 'bts', 'Hình ảnh hậu trường từ các buổi chụp.', NULL, true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-couple', 'Couple', 'couple', 'Các album dành cho cặp đôi.', NULL, true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-gia-dinh', 'Gia Đình – Mẹ & Bé', 'gia-dinh', 'Các album gia đình, mẹ và bé.', NULL, true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-wedding', 'Wedding', 'wedding', 'Các album ảnh cưới của NDT Studio.', NULL, true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-me-bau', 'Mẹ Bầu', 'me-bau', 'Các album ảnh mẹ bầu.', NULL, true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-doi-nhom', 'Đôi – Nhóm', 'doi-nhom', 'Các album chụp đôi và nhóm.', NULL, true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-quang-cao', 'Quảng Cáo', 'quang-cao', 'Các album hình ảnh quảng cáo.', NULL, true, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-san-pham', 'Sản Phẩm', 'san-pham', 'Các album hình ảnh sản phẩm.', NULL, true, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "showInNavigation" = EXCLUDED."showInNavigation",
  "navigationOrder" = EXCLUDED."navigationOrder";

INSERT INTO "Category" (
  "id", "name", "slug", "description", "parentId",
  "showInNavigation", "navigationOrder", "createdAt", "updatedAt"
)
VALUES
  ('gallery-category-beauty', 'Beauty', 'beauty', 'Các album beauty.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-cong-chua', 'Công Chúa – Nàng Thơ', 'cong-chua', 'Các album công chúa và nàng thơ.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-birthday', 'Birthday', 'birthday', 'Các album sinh nhật.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-thoi-trang', 'Thời Trang', 'thoi-trang', 'Các album thời trang.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-tet-trung-thu', 'Tết – Trung Thu – Cổ Trang', 'tet-trung-thu', 'Các album Tết, Trung Thu và cổ trang.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-noel-mua-dong', 'Noel – Mùa Đông', 'noel-mua-dong', 'Các album Noel và mùa đông.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-cosplay', 'Cosplay', 'cosplay', 'Các album cosplay.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gallery-category-quyen-ru', 'Quyến Rũ – Sexy', 'quyen-ru', 'Các album phong cách quyến rũ.', (SELECT "id" FROM "Category" WHERE "slug" = 'nu'), true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "showInNavigation" = EXCLUDED."showInNavigation",
  "navigationOrder" = EXCLUDED."navigationOrder";
