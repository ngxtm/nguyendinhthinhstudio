# Kiểm tra Search Console ngày 22/10/2026

## Kết quả đối chiếu website đang chạy

Ảnh chụp Search Console là dữ liệu lần thu thập trước. Kiểm tra dưới đây dùng
HTTP GET thực tế, không suy ra tình trạng hiện tại từ ảnh chụp hoặc chỉ từ HEAD.

| Nhóm URL trong ảnh | Kết quả hiện tại | Xử lý |
| --- | --- | --- |
| `/&` | 404 | Bổ sung 301 về `/`, gồm cả dạng mã hóa `/%26`; giữ query string |
| `/thu-vien?page=2` | 200, canonical trỏ chính trang 2 | Giữ phân trang hiện có |
| `/thu-vien/danh-muc/thoi-trang?page=2` | 200, canonical trỏ chính trang 2 | Giữ phân trang hiện có |
| Bốn ảnh trong báo cáo 404 | 200, `image/webp` | Không thay ảnh hoặc tạo chuyển hướng không cần thiết |
| URL gốc API `https://api.ndtstudio.com.vn/` | 404, `X-Robots-Tag: noindex, nofollow` | Đây là endpoint gốc không có nội dung; giữ loại trừ có chủ đích |
| HTTP trang chủ và năm đường dẫn cũ trong ảnh | 301 về URL HTTPS hoặc trang thay thế đúng | Giữ chuyển hướng |
| Birthday trang 4 và 5 | 200, canonical riêng cho từng trang | Không gộp canonical về trang 1 |
| `/bang-gia`, danh mục Công Chúa | 200, self-canonical trên `.com.vn` | Không ghi đè canonical dựa trên báo cáo lịch sử |
| `/og` | 200, `image/png`, chưa có `noindex` trên production | Bổ sung `X-Robots-Tag: noindex` cho ảnh chia sẻ chung |

URL ảnh được đối chiếu lại với dữ liệu ảnh công khai để tránh đọc nhầm ký tự
`I/l`, `O/0` và UUID từ ảnh chụp. Danh sách URL chính xác nằm trong
`scripts/verify-search-indexing.mjs`.

## Thay đổi trong workspace

- Thêm hai chuyển hướng chính xác `/&` và `/%26` vào manifest SEO. Các host
  `www` chuyển thẳng tới trang chủ canonical, không thêm bước chuyển hướng.
- Thêm `noindex` cho `/og`. Ảnh album vẫn được phép lập chỉ mục hình ảnh.
- Cấu hình Traefik của imgproxy phục vụ cả `img.ndtstudio.com.vn` và
  `img.ndtstudio.site`. Đây là sửa cấu hình trong repository; không khẳng định
  production đã áp dụng nhãn mới.
- Thêm `npm run verify:search-indexing`: dùng GET, kiểm tra các ví dụ đã báo cáo
  và toàn bộ URL trong page sitemap, HTTP status, canonical, robots, MIME ảnh,
  đích redirect và liên kết `/&` còn phát sinh trong HTML. Tối đa ba request
  đồng thời; lỗi mạng/sitemap làm lệnh thất bại. Có thể dùng `-- --reported-only`
  để chỉ kiểm tra các ví dụ.
- Cập nhật kiểm thử metadata trang chủ để chấp nhận nội dung “kỷ yếu” đã có sẵn;
  không thay nội dung trang chủ để chiều theo regex cũ.

Lệnh này kiểm tra page sitemap và bốn ảnh của báo cáo 404; không tải toàn bộ
ảnh trong image sitemap, không đọc trạng thái riêng tư trong Search Console.

## Xác minh bản sửa

- Quét production **239 URL**: lần chạy cuối đạt 233, ba lỗi kết nối mạng
  tạm thời và ba kiểm tra chưa đạt do bản sửa chưa phát hành (`/&`, `/%26`,
  `/og`). Kiểm tra GET lại riêng `/thu-vien/ao-dai-tet`,
  `/thu-vien/viet-phuc-1`, `/thu-vien/yem-tet` đều 200 và canonical đúng.
  Như vậy không còn lỗi nội dung được xác nhận trong các URL còn lại; lệnh
  production vẫn trả exit code 1 cho các điều kiện chưa đạt.
- Frontend: **158/158** kiểm thử qua.
- Công cụ kiểm tra SEO: **5/5** kiểm thử qua, gồm trường hợp 404, sai canonical,
  noindex, sai đích redirect, HTML giả ảnh và sitemap rỗng.
- `npx tsc --noEmit --incremental false -p apps/frontend/tsconfig.json`: qua.
- YAML Compose đọc được, rule imgproxy chứa cả hai host.
- HTTP trên Next.js local tại cổng 3101: `/&?utm_source=qa` trả **301** tới
  `/?utm_source=qa`; `/%26` trả **301** tới `/`; `/og` trả **200**, `image/png`,
  `X-Robots-Tag: noindex`. Máy chủ kiểm tra đã được dừng.
- Build frontend production đã chạy nhưng thất bại khi tải Google Fonts
  (`fonts.googleapis.com`, `fonts.gstatic.com`, lỗi module font Turbopack).
  Không thay cấu hình font, tắt kiểm tra HTTPS, hoặc tuyên bố build đã qua.

Các phản hồi production vẫn phản ánh bản đang triển khai, chưa có bản sửa này.
Chưa push, triển khai, đổi DNS/Cloudflare hoặc bấm xác thực trong Search Console.

## Sau khi phát hành

1. Xử lý lỗi môi trường build/font nếu còn xảy ra trong môi trường phát hành,
   sau đó triển khai frontend và cấu hình imgproxy theo quy trình hiện có.
2. Chạy lại `npm run verify:search-indexing`. `/&`, `/%26` và `/og` phải đạt
   các trạng thái mới trước khi xác nhận sửa lỗi.
3. Trong Search Console, kiểm tra URL trực tiếp đối với thư viện trang 2,
   Thời Trang trang 2, Birthday trang 4–5, `/bang-gia` và Công Chúa; xem cả
   canonical do Google chọn. Kiểm tra sitemap `.com.vn` đang được đọc thành công.
4. Bấm **Xác thực bản sửa** cho nhóm 404 đã xử lý và yêu cầu lập chỉ mục các
   trang nội dung hợp lệ khi cần. Giữ API, redirect và ảnh chia sẻ ngoài danh
   sách yêu cầu lập chỉ mục trang nội dung.

“Trang có lệnh chuyển hướng” và 404 cho URL thực sự không có nội dung có thể là
loại trừ bình thường. Google quyết định lập chỉ mục và canonical sau khi thu
thập lại; code không thể bảo đảm mọi mục trong báo cáo biến mất ngay.
Tham khảo [hướng dẫn báo cáo lập chỉ mục của Google](https://support.google.com/webmasters/answer/7440203?hl=en).
`X-Robots-Tag` cũng áp dụng được cho tài nguyên không phải HTML như `/og`:
[tài liệu Google về robots headers](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
