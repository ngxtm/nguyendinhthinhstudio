# Đơn giản hóa pipeline upload ảnh admin

Pipeline upload ảnh admin dùng trình duyệt để luôn encode JPEG/PNG/WebP thành một WebP tĩnh và dùng Sharp ở backend để full-decode xác nhận object trước khi lưu chính thức. Hệ thống loại bỏ package policy dùng chung, custom image grammar, ICC/EXIF inspection, policy endpoint/version/hash/snapshot và dimension rules riêng vì độ phức tạp này không mang lại giá trị tương xứng cho workflow một admin; auth, digest, presign/confirm và kiểm tra dung lượng/khả năng decode vẫn được giữ.

Quyết định được triển khai bằng cold-cutover: frontend cũ không được hỗ trợ, admin tự refresh, và các cột policy bị xóa trong cùng release. Quyết định này thay thế các phần policy, canonical grammar và ICC allowlist của `docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md`.
