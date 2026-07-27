# Staff Attendance

Ngôn ngữ nghiệp vụ dùng cho Staff Portal để mô tả ca làm việc và quá trình chấm công của nhân viên.

## Language

**Ca làm việc**:
Khoảng làm việc được phân công với giờ bắt đầu nhưng không có giờ kết thúc định trước; check-out tạo thời điểm kết thúc thực tế của ca.
_Avoid_: Giờ kết thúc dự kiến, check-out sớm

**Check-in**:
Thời điểm nhân viên xác nhận bắt đầu ca; check-in có hiệu lực ngay và không phụ thuộc vào việc tải ảnh.
_Avoid_: Check-in chờ ảnh

**Cửa sổ check-in**:
Khoảng thời gian bắt đầu từ 15 phút trước giờ bắt đầu của ca, khi nhân viên không có ca đang hoạt động và được phép check-in. Cửa sổ vẫn mở sau giờ bắt đầu cho tới khi nhân viên check-in.
_Avoid_: Check-in bất kỳ lúc nào, cửa sổ đóng khi ca bắt đầu

**Thời gian ân hạn check-in**:
Khoảng 15 phút sau giờ bắt đầu mà check-in vẫn được tính là đúng giờ.
_Avoid_: Check-in muộn ngay sau giờ bắt đầu

**Check-in muộn**:
Check-in được thực hiện sau thời gian ân hạn 15 phút; hệ thống vẫn chấp nhận, ghi nhận thời điểm thực tế và cho phép nhập lý do tùy chọn.
_Avoid_: Check-in bị khóa, lý do bắt buộc

**Ca bỏ lỡ**:
Ca chưa được check-in khi cửa sổ check-in của ca tiếp theo mở, hoặc khi hết ngày nếu không có ca tiếp theo; ca này không còn được phép check-in.
_Avoid_: Ca đang chờ check-in, ca cũ còn hiệu lực

**Ca tiếp theo**:
Ca được phân công sau ca đang hoạt động và luôn được hiển thị. Nếu cửa sổ check-in đã mở nhưng ca hiện tại chưa check-out, check-in ca tiếp theo bị khóa; sau khi ca hiện tại kết thúc, nhân viên được check-in và quy tắc check-in muộn vẫn áp dụng.
_Avoid_: Tự động check-out, tự động bỏ lỡ ca tiếp theo

**Đã chấm công**:
Trạng thái của một ca làm việc đã có cả thời điểm check-in và một check-out hợp lệ.
_Avoid_: Đã check-in, đang làm việc

**Check-out hợp lệ**:
Check-out được chấp nhận ngay khi ca studio xác nhận vị trí trong phạm vi studio hoặc tải ảnh kết thúc lên thành công; nhân viên được chọn một trong hai cách. Ca ngoại cảnh bắt buộc có ảnh kết thúc.
_Avoid_: Chờ xác minh, yêu cầu chấm công thủ công

**GPS check-out**:
Cách check-out của ca studio dùng vị trí trong phạm vi studio; khi GPS hợp lệ thì không cần tải ảnh.
_Avoid_: GPS bắt buộc

**Ảnh check-out**:
Ảnh kết thúc được chụp trực tiếp hoặc chọn từ thư viện. Với ảnh chụp trực tiếp, thời điểm chụp là thời điểm check-out; với ảnh từ thư viện, thời điểm nhân viên chọn và xác nhận ảnh trong Staff Portal là thời điểm check-out.
_Avoid_: Thời gian EXIF, thời điểm tải ảnh, ảnh dự phòng, ảnh chờ duyệt

**Ảnh chờ gửi**:
Ảnh check-out đã được lưu khi thiết bị không có mạng nhưng chưa tải lên thành công. Khi tải thành công, hệ thống giữ mốc check-out ban đầu của ảnh.
_Avoid_: Ảnh đã tải lên, ảnh chờ duyệt

**Ảnh check-out thay thế**:
Ảnh được chụp lại khi ảnh chờ gửi bị mất. Nếu mốc giờ cũ còn thì giữ mốc đó làm thời điểm check-out; nếu cả ảnh và mốc giờ đều mất thì thời điểm chụp ảnh thay thế là thời điểm check-out mới.
_Avoid_: Luôn giữ giờ cũ, giờ không có bằng chứng

**Đã kết thúc — chờ gửi ảnh**:
Trạng thái của ca đã có thời điểm kết thúc theo mốc check-out của ảnh nhưng ảnh chưa tải lên thành công. Ca không còn hoạt động và không chặn check-in ca tiếp theo, nhưng chưa được tính là đã chấm công.
_Avoid_: Ca đang hoạt động, đã chấm công

**Loại ca**:
Phân loại `Studio` hoặc `Ngoại cảnh` do quản lý xác định khi tạo hoặc phân công ca. Quản lý chỉ được thay đổi trước check-in; loại ca bị khóa sau khi check-in thành công và nhân viên không được tự thay đổi.
_Avoid_: Phương thức check-out, lựa chọn của nhân viên
