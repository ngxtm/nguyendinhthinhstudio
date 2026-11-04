# Quản lý bảng giá

Admin mở **Bảng giá** tại `/admin/pricing` để chỉnh giá của 34 gói thuộc 7 nhóm: Cá nhân, Cặp đôi, Gia đình, Wedding, Video, Team & Ekip và Thuê studio.

- Nhập số tiền đầy đủ bằng VNĐ, ví dụ `3500000` hoặc `3.500.000`. Giá phải là số nguyên từ 1 đến 999.999.999 đồng. Đơn vị theo người của các gói Gia đình và Team được giữ nguyên.
- Bấm **Ngừng bán** bên cạnh từng gói để chuẩn bị ẩn gói đó. Không nhập chữ vào ô giá. Bấm **Mở bán lại** để khôi phục gói với giá đã giữ lại; vẫn có thể sửa giá trước khi mở bán.
- **Lưu nháp** lưu giá và trạng thái bán của nhóm đang chọn để tiếp tục chỉnh sửa sau. Khách truy cập vẫn thấy bản đã xuất bản.
- **Xuất bản giá** lưu và công khai toàn bộ giá và trạng thái bán đang chỉnh sửa trong nhóm đang chọn. Không bắt buộc lưu nháp trước. Các nhóm khác không bị ảnh hưởng.
- **Hủy thay đổi** trở về bản nháp được lưu gần nhất; không xóa bản nháp đã lưu.
- Khi có phiên khác lưu trước, admin phải tải lại bảng giá. Thay đổi đang nhập được giữ khi lưu thất bại.
- Nút **Xem bảng giá** mở trang công khai, chỉ hiển thị giá đã xuất bản.
- Trên trang công khai, gói ngừng bán được ẩn hoàn toàn, gồm giá, nội dung và nút đặt lịch. Nhóm Premium/Standard không còn gói nào cũng được ẩn. Một gói còn lại được căn giữa với chiều rộng giới hạn; hai gói chia hai cột; trên điện thoại xếp một cột. Khi tất cả các gói ngừng bán, trang hiển thị thông báo tạm ngừng mở bán và nút **Liên hệ tư vấn**.

- Nhóm **Thuê studio** có hai lựa chọn Phông vô cực và Phông giấy tại `/bang-gia/thue-studio`. Mỗi lựa chọn có hai ô giá: **2 giờ đầu** và **Mỗi giờ tiếp theo**. Lưu nháp/xuất bản cả hai mức giá cùng nhau; nút ngừng bán ẩn toàn bộ lựa chọn phông, không ẩn riêng một mức giá.
- Giá khởi tạo: Phông vô cực 750.000đ/2 giờ đầu, 350.000đ/giờ tiếp theo; Phông giấy 350.000đ/2 giờ đầu, 150.000đ/giờ tiếp theo. Tiện ích và khoản thuê thêm máy ảnh 400.000đ/giờ là nội dung cố định của trang; đèn LED, phụ kiện và trang phục liên hệ báo giá riêng.

Phạm vi quản lý hiện tại là giá chính, giá gia hạn theo giờ của gói thuê studio và trạng thái bán của từng gói. Nội dung gói, dịch vụ kèm thêm, phụ thu và điều khoản vẫn lấy từ các tệp dữ liệu hiện có.

## Lưu trữ và triển khai

Mỗi nhóm dùng một bản ghi trong bảng `SiteSettings`, với key `pricing.<category>`. Bản ghi chứa giá nháp/công khai, danh sách ID gói ẩn `draftHiddenPackageIds`/`publishedHiddenPackageIds`, thời điểm lưu/xuất bản và revision. Ghi có điều kiện trên giá trị bản ghi ngăn các phiên ghi đè nhau. Endpoint cấu hình tổng quát không được phép ghi vào các key này.

Không cần migration hoặc seed. Trước lần lưu đầu tiên, giá được lấy từ `packages/types/pricing-catalog.json`; bộ kiểm thử đối chiếu giá khởi tạo này với tất cả gói hiện có. Khi thêm, đổi tên hoặc xóa gói, cần cập nhật catalog và chuyển đổi các bản ghi đã lưu tương ứng.

Bản ghi cũ chưa có danh sách gói ẩn được hiểu là tất cả gói đang bán. Client cũ chỉ gửi giá sẽ giữ danh sách ẩn của bản nháp gần nhất. Danh sách ẩn có dữ liệu sai bị từ chối, không tự mở bán lại gói.

Triển khai backend trước frontend. Ảnh Docker backend phải chứa workspace `packages/types` để đọc catalog lúc chạy. Chưa có thao tác triển khai nào trong thay đổi này.

## API

| Endpoint                                | Quyền     | Ý nghĩa                                   |
| --------------------------------------- | --------- | ----------------------------------------- |
| `GET /pricing/:category`                | Công khai | Chỉ giá đã xuất bản và thời điểm xuất bản |
| `GET /pricing/admin/:category`          | Admin     | Giá nháp, giá công khai và revision       |
| `PUT /pricing/admin/:category/draft`    | Admin     | Lưu nháp                                  |
| `POST /pricing/admin/:category/publish` | Admin     | Lưu và xuất bản                           |

Hai endpoint ghi nhận `{ revision, prices, hiddenPackageIds? }`, với `prices` là map đầy đủ các ID gói của nhóm sang số tiền VNĐ, kể cả gói ngừng bán. `hiddenPackageIds` là danh sách ID duy nhất thuộc nhóm; `[]` mở bán tất cả, bỏ qua trường này giữ trạng thái nháp hiện có. API công khai trả `hiddenPackageIds` từ bản đã xuất bản cùng `prices`. Revision không còn khớp trả về HTTP 409. Các endpoint dùng `Cache-Control: no-store`; các trang Next.js lấy giá công khai ở server với `cache: 'no-store'`. Giá và trạng thái bán mới xuất hiện khi tải lại trang công khai. Nếu không thể tải giá, trang báo lỗi để thử lại, thay vì hiển thị lại giá khởi tạo cũ.

Các mức giá gia hạn được định nghĩa trong `additionalRates` của catalog. Map `prices` của nhóm Thuê studio phải có đủ `phong-vo-cuc`, `phong-vo-cuc-hourly`, `phong-giay`, `phong-giay-hourly`. Danh sách `hiddenPackageIds` chỉ nhận ID gói chính. Thêm nhóm mới dùng key `pricing.thue-studio`, không sửa cấu trúc dữ liệu của sáu nhóm cũ và không cần migration.

## Kiểm tra

```sh
npm run test --workspace=backend -- --runInBand --runTestsByPath src/pricing/pricing.service.spec.ts src/pricing/pricing.controller.spec.ts
npm run test:pricing --workspace=frontend
npm run build --workspace=backend
npm run build --workspace=frontend
```

Kiểm thử trình duyệt chạy component thật và `PricingService` thật với kho lưu trong bộ nhớ, API client và Next Link dành riêng cho kiểm thử. Nó không kết nối cơ sở dữ liệu hay phiên đăng nhập production. Bộ kiểm thử HTTP riêng xác nhận quyền truy cập và kiểm tra request bằng Nest guards/validation.
