# Nội dung SEO địa phương — source-backed subset đã áp dụng

Ngày: 2026-09-20. Phần metadata/H1/alt trong bảng đã áp dụng ở working tree để kiểm thử local; chưa redeploy production. Không sửa dữ liệu DB, taxonomy hoặc mô tả album.

| URL | Title hiện tại | Title đã áp dụng | Description đã áp dụng | Trạng thái |
| --- | --- | --- | --- |
| `/` | NDT Studio - Nhiếp ảnh chuyên nghiệp | Studio chụp ảnh tại Nha Trang \| NDT Studio | Chụp ảnh cưới, gia đình, beauty và couple tại Nha Trang. Xem thư viện, bảng giá và liên hệ đặt lịch cùng NDT Studio. | Đã áp dụng local |
| `/bang-gia/ca-nhan` | Bảng giá chụp ảnh cá nhân \| NDT Studio | Chụp ảnh cá nhân tại Nha Trang - Bảng giá \| NDT Studio | Tham khảo bảng giá chụp ảnh cá nhân tại Nha Trang cho nữ, nam, mẹ bầu và trẻ em; liên hệ NDT Studio để tư vấn, đặt lịch. | Đã áp dụng local |
| `/bang-gia/couple` | Bảng giá chụp ảnh cặp đôi \| NDT Studio | Chụp ảnh couple tại Nha Trang - Bảng giá \| NDT Studio | Tham khảo bảng giá chụp ảnh couple tại Nha Trang cho các cặp đôi và nhu cầu kỷ niệm; liên hệ NDT Studio để tư vấn, đặt lịch. | Đã áp dụng local |
| `/bang-gia/gia-dinh` | Bảng giá chụp ảnh gia đình \| NDT Studio | Chụp ảnh gia đình tại Nha Trang - Bảng giá \| NDT Studio | Tham khảo bảng giá chụp ảnh gia đình tại Nha Trang và các gói hiện có của NDT Studio; liên hệ để được tư vấn. | Đã áp dụng local |
| `/bang-gia/team` | Bảng giá chụp ảnh team và doanh nghiệp \| NDT Studio | Chụp ảnh team tại Nha Trang - Bảng giá \| NDT Studio | Tham khảo bảng giá chụp ảnh team tại Nha Trang, profile cá nhân, ảnh nhóm và hình ảnh branding; liên hệ NDT Studio để tư vấn. | Đã áp dụng local |
| `/bang-gia/video` | Bảng giá quay video \| NDT Studio | Bảng giá quay video tại Nha Trang \| NDT Studio | Tham khảo bảng giá các gói quay và sản xuất video nội dung tại Nha Trang của NDT Studio; liên hệ để tư vấn. | Đã áp dụng local |
| `/bang-gia/wedding` | Bảng giá chụp ảnh cưới \| NDT Studio | Chụp ảnh cưới tại Nha Trang - Bảng giá \| NDT Studio | Tham khảo bảng giá các gói chụp ảnh cưới tại Nha Trang của NDT Studio; liên hệ để được tư vấn theo nhu cầu. | Đã áp dụng local |

## Ràng buộc nội dung đã giữ

- Trang chủ: bổ sung H1 thể hiện dịch vụ địa phương và hạ heading các mục con cần duyệt bố cục; không đổi typography vô ý.
- Cá nhân: xác nhận cách gọi Baby/trẻ em và các đối tượng được phục vụ. Không tự thêm số ảnh, thời gian, makeup hoặc giá.
- Couple: giữ đúng phạm vi cặp đôi; không mặc định bao gồm nhóm bạn/mẹ và bé. Dữ liệu có ghi trang phục chưa bao gồm.
- Gia đình: source hiện có mô tả 3–5 người, dữ liệu gói có 1–5 và trên 8 người. Cần xác nhận trước khi nêu số lượng trong nội dung SEO.
- Team: xác nhận phạm vi branding/profile doanh nghiệp và các đầu ra; không suy rộng từ tên gói.
- Video: xác nhận phạm vi cá nhân so với KOL/doanh nghiệp; thời gian hoàn thành, định dạng và feedback phải có nguồn được duyệt.
- Wedding: xác nhận Wedding Day có thuộc dịch vụ thực tế hay không; không hứa thử váy hoặc quyền lợi chưa có trong gói.

## Liên kết nội bộ

- Tất cả trang dịch vụ: bảng giá tổng `/bang-gia`, đặt lịch `/lien-he#ho-tro-nhanh`.
- Cá nhân/couple/gia đình/wedding: đi qua `categoryHref` và danh sách slug public trong DB; không hard-code link đến category không tồn tại.
- Team: `/thu-vien` cho đến khi xác nhận category phù hợp.
- Video: portfolio `/video`.
- Không đổi taxonomy, slug hoặc mô tả album. Mô tả danh mục cần đề xuất riêng và được duyệt trước khi cập nhật Admin.

## Nguồn và nghiệm thu

Đã đối chiếu `apps/frontend/src/app/(public)/page.tsx`, metadata/layout/page và các file data của sáu route bảng giá; `apps/frontend/src/lib/public-navigation.ts` là nơi kiểm tra category và fallback.

Đã kiểm thử metadata/heading/liên kết ở source. Các đề xuất này không dựa trên nghiên cứu lượng tìm kiếm và không bảo đảm thứ hạng; browser và production HTTP vẫn là bước nghiệm thu sau redeploy.

Trạng thái: **Đã áp dụng local — chờ frontend redeploy và kiểm tra live.**
