# Quản lý bảng giá

Admin mở **Bảng giá** tại `/admin/pricing` để chỉnh giá của 32 gói thuộc 6 nhóm: Cá nhân, Cặp đôi, Gia đình, Wedding, Video và Team & Ekip.

- Nhập số tiền đầy đủ bằng VNĐ, ví dụ `3500000` hoặc `3.500.000`. Giá phải là số nguyên từ 1 đến 999.999.999 đồng. Đơn vị theo người của các gói Gia đình và Team được giữ nguyên.
- **Lưu nháp** lưu các giá của nhóm đang chọn để tiếp tục chỉnh sửa sau. Khách truy cập vẫn thấy giá đã xuất bản.
- **Xuất bản giá** lưu và công khai toàn bộ giá đang chỉnh sửa trong nhóm đang chọn. Không bắt buộc lưu nháp trước. Các nhóm khác không bị ảnh hưởng.
- **Hủy thay đổi** trở về bản nháp được lưu gần nhất; không xóa bản nháp đã lưu.
- Khi có phiên khác lưu trước, admin phải tải lại bảng giá. Thay đổi đang nhập được giữ khi lưu thất bại.
- Nút **Xem bảng giá** mở trang công khai, chỉ hiển thị giá đã xuất bản.

Phạm vi quản lý hiện tại là giá chính của từng gói. Nội dung gói, dịch vụ kèm thêm, phụ thu và điều khoản vẫn lấy từ các tệp dữ liệu hiện có.

## Lưu trữ và triển khai

Mỗi nhóm dùng một bản ghi trong bảng `SiteSettings`, với key `pricing.<category>`. Bản ghi chứa bản nháp, bản công khai, thời điểm lưu/xuất bản và revision. Ghi có điều kiện trên giá trị bản ghi ngăn các phiên ghi đè nhau. Endpoint cấu hình tổng quát không được phép ghi vào các key này.

Không cần migration hoặc seed. Trước lần lưu đầu tiên, giá được lấy từ `packages/types/pricing-catalog.json`; bộ kiểm thử đối chiếu giá khởi tạo này với tất cả gói hiện có. Khi thêm, đổi tên hoặc xóa gói, cần cập nhật catalog và chuyển đổi các bản ghi đã lưu tương ứng.

Triển khai backend trước frontend. Ảnh Docker backend phải chứa workspace `packages/types` để đọc catalog lúc chạy. Chưa có thao tác triển khai nào trong thay đổi này.

## API

| Endpoint                                | Quyền     | Ý nghĩa                                   |
| --------------------------------------- | --------- | ----------------------------------------- |
| `GET /pricing/:category`                | Công khai | Chỉ giá đã xuất bản và thời điểm xuất bản |
| `GET /pricing/admin/:category`          | Admin     | Giá nháp, giá công khai và revision       |
| `PUT /pricing/admin/:category/draft`    | Admin     | Lưu nháp                                  |
| `POST /pricing/admin/:category/publish` | Admin     | Lưu và xuất bản                           |

Hai endpoint ghi nhận `{ revision, prices }`, với `prices` là map đầy đủ các ID gói của nhóm sang số tiền VNĐ. Revision không còn khớp trả về HTTP 409. Các endpoint dùng `Cache-Control: no-store`; các trang Next.js lấy giá công khai ở server với `cache: 'no-store'`. Giá mới xuất hiện khi tải lại trang công khai. Nếu không thể tải giá, trang báo lỗi để thử lại, thay vì hiển thị lại giá khởi tạo cũ.

## Kiểm tra

```sh
npm run test --workspace=backend -- --runInBand --runTestsByPath src/pricing/pricing.service.spec.ts src/pricing/pricing.controller.spec.ts
npm run test:pricing --workspace=frontend
npm run build --workspace=backend
npm run build --workspace=frontend
```

Kiểm thử trình duyệt chạy component thật và `PricingService` thật với kho lưu trong bộ nhớ, API client và Next Link dành riêng cho kiểm thử. Nó không kết nối cơ sở dữ liệu hay phiên đăng nhập production. Bộ kiểm thử HTTP riêng xác nhận quyền truy cập và kiểm tra request bằng Nest guards/validation.
