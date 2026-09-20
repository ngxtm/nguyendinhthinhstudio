# SEO Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for the task sequence; use `superpowers:subagent-driven-development` when delegating implementation. Steps use checkbox syntax. Follow the model routing below and review between milestones. No automatic commit, push, deployment, or external configuration changes.

**Goal:** Cải thiện khả năng thu thập dữ liệu, SEO hình ảnh và khả năng tìm thấy dịch vụ NDT Studio tại Nha Trang, không làm thay đổi dữ liệu album hoặc trải nghiệm thư viện ngoài phạm vi được duyệt.

**Architecture:** Giữ Next.js App Router, NestJS và mô hình dữ liệu hiện tại. Sửa lỗi HTTP/metadata trước; bổ sung phân trang crawlable tương thích infinite scroll; dùng sitemap ảnh riêng và các biến thể ảnh hiện có. Tách thay đổi mã nguồn khỏi nội dung cần chủ studio xác nhận và thao tác production/Search Console.

**Tech Stack:** Next.js 16, React 19, SWR, NestJS, Prisma, imgproxy/R2; frontend Node test runner + tsx, backend Jest.

**Spec:** Phần “Thiết kế và ràng buộc” bên dưới là đặc tả của kế hoạch này, dựa trên đề xuất SEO đã trao đổi và yêu cầu lập kế hoạch ngày 2026-09-17. Tham chiếu `docs/runbooks/domain-migration-com-vn.md`. Spec indexing ngày 2026-07-28 chỉ dùng để hiểu hành vi; tên miền `.site` trong tài liệu cũ không còn là chuẩn cho thay đổi mới.

**Status:** Đang triển khai trên `main` theo xác nhận người dùng; Task 7 đã áp dụng source-backed copy ở local ngày 2026-09-20, chưa commit/push/deploy. Các checkbox chỉ được đánh dấu khi có bằng chứng thực tế. Baseline: `docs/qa/2026-09-18-seo-baseline.md`; ma trận nội dung local: `docs/seo/local-content-matrix.md`; quy trình nghiệm thu: `docs/runbooks/seo-verification.md`.

## Phân công model theo yêu cầu người dùng ngày 2026-09-18

- Agent chính: Astra (`gpt-6-astra`), reasoning `medium`, phụ trách ý tưởng, thiết kế, kế hoạch, quyết định đánh đổi và tổng hợp kết quả.
- Sub-agent: Luna (`gpt-5.6-luna`), reasoning `max`, phụ trách khảo sát có phạm vi, thực thi từng task, viết/chạy kiểm thử và rà soát độc lập.
- Khi spawn, đặt rõ `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, dùng `fork_turns: "none"` và chỉ chuyển task, interface, ràng buộc, file cần thiết để tiết kiệm context.
- Chỉ giao việc độc lập; không cho hai agent chỉnh cùng file đồng thời. Các thay đổi phụ thuộc, API trước consumer và service lifecycle phải theo thứ tự.
- Agent chính kiểm tra evidence và diff trước nghiệm thu; không gọi lại Astra để lặp toàn bộ công việc Luna đã chứng minh được.
- Cấu hình agent chính do phiên chạy quyết định; không tự nhận đã đổi model/effort của phiên qua công cụ spawn. Nếu phiên không đúng Astra medium, người dùng chọn cấu hình đó trong ứng dụng.
- Phân công này áp dụng cho kế hoạch hiện tại, không tự ghi thành memory/cấu hình toàn cục. Cho phép dùng sub-agent không đồng nghĩa duyệt triển khai, deploy hoặc thay đổi bên ngoài.

## Thiết kế và ràng buộc

- Canonical website: `https://ndtstudio.com.vn`; không đổi slug album, taxonomy, bảng giá hoặc tên miền API/ảnh.
- Giữ gallery sort, 8 album mỗi batch, 4 ảnh mỗi batch của giao diện album, mobile, lightbox và logic đề xuất album hiện có.
- Không sửa dữ liệu production, tự tạo mô tả album, ghi đè SEO/alt do người dùng nhập hoặc chạy bulk backfill. Nội dung biên tập được duyệt riêng.
- Không thêm Redis, queue, database migration hoặc dependency mới chỉ để làm SEO. Nếu cần hạ tầng mới, báo rõ và xin quyết định riêng.
- Metadata/schema phải mô tả đúng nội dung hiện hữu; không tạo review/rating giả, cam kết dịch vụ hoặc giá chưa xác nhận.
- Chỉ `ApiError(404)` từ truy vấn album chính được chuyển thành `notFound()`. Lỗi upstream không được giả thành album không tồn tại.
- Sitemap không công bố một danh sách rút gọn như kết quả thành công khi upstream lỗi. Ưu tiên ISR giữ bản thành công trước đó; cache lạnh lỗi phải thất bại rõ ràng. Không hứa giữ cache qua redeploy nếu chưa chứng minh.
- Phân trang dùng URL có thể mở độc lập và HTML chứa link thật; page 2 canonical về page 2, không về page 1. Không dựa vào `rel=next/prev` để Google khám phá.
- Không ẩn nội dung riêng cho bot. Tắt JavaScript vẫn đọc được batch hiện tại và đi tới batch tiếp theo.
- Không cam kết tăng hạng/index. Kiểm thử source, HTTP local, browser và production là các mức bằng chứng khác nhau.
- Chỉ chạy build với cấu hình local/staging phù hợp; không sửa cấu hình HTTPS, fonts hoặc package không liên quan để làm xanh kiểm thử.

## Mốc triển khai và phụ thuộc

| Đợt | Task | Kết quả có thể nghiệm thu riêng |
| --- | --- | --- |
| 0 | 0 | Baseline và checklist tên miền, không thay đổi ứng dụng |
| 1 | 1–4 | Trang album/sitemap đáng tin cậy, thông tin doanh nghiệp và social preview đúng |
| 2 | 5–6 | Google có đường khám phá album và ảnh ngoài batch đầu |
| 3 | 7–8 | Nội dung dịch vụ địa phương rõ hơn, ảnh tải phù hợp và ít nhảy bố cục |
| 4 | 9 | Báo cáo nghiệm thu, hướng dẫn triển khai và đo SEO thực tế |

Task 1–4 độc lập về chức năng nhưng thực hiện từng task. Task 5 chốt hợp đồng backend trước frontend. Task 6 kế thừa cách xử lý lỗi sitemap của Task 2. Task 7 cần duyệt nội dung, Task 9 cần quyền riêng cho các thao tác bên ngoài.

## Task 0 — Baseline và kiểm tra điều kiện tên miền

**Files:** Đọc `docs/runbooks/domain-migration-com-vn.md`, `apps/frontend/seo-routes.mjs`, `apps/frontend/src/lib/seo.ts`; tạo `docs/qa/2026-09-17-seo-baseline.md` khi bắt đầu thực thi.

**Interfaces:** Không đổi API. Output là bảng URL/status/canonical/robots và kết quả lệnh có thời điểm, môi trường, revision.

- [ ] Chạy `git status --short`; ghi nhận thay đổi người dùng và phạm vi được phép chỉnh.
- [ ] Từ `apps/frontend`, chạy `node --import tsx --test test/seo-indexing.contract.test.ts test/seo-domain-migration.test.ts`. Mốc lượt rà soát trước: 18/18 pass, không thay cho lần chạy mới.
- [ ] Đo HTTP read-only cho trang chủ, thư viện, danh mục có album, album có thật, liên hệ, bảng giá, URL không tồn tại, robots và sitemap. Chọn slug hiện tồn tại, không coi slug mẫu trong runbook là chắc chắn còn sống.
- [ ] Kiểm tra HTTP/HTTPS, www/apex của cả domain cũ và mới, một URL lồng nhau có query. Ghi từng hop, final URL, canonical, robots. Không sửa Cloudflare/DNS.
- [ ] Nếu live chưa đồng nhất `.com.vn`, ghi blocker cho Task 9; các task mã nguồn vẫn làm được. Không nộp sitemap/Change of Address trước live gate.

**Done:** Có baseline phân biệt source/local/live. Không suy ra trạng thái Google index từ HTTP 200.

## Task 1 — Không biến lỗi API thành album 404

**Files:**

- Modify: `apps/frontend/src/app/(public)/thu-vien/[slug]/page.tsx`.
- Create: `apps/frontend/src/lib/server/public-album-page.ts`.
- Create: `apps/frontend/test/public-album-page-errors.test.ts`.
- Regression: `apps/frontend/test/public-album-detail-batching.contract.test.ts`.

**Interfaces:** Giữ `getAlbum(slug): Promise<Album>`, `getRelatedAlbums(slug): Promise<Album[]>`, `getAlbumImageBatch(id): Promise<AlbumImagePage>`. Helper dùng dependency injection để test, trả `{ album, initialImagePage, relatedAlbums }`; không đổi props của client.

- [ ] Viết test với API giả: album 404 phải giữ nguyên lỗi 404; album 500/429/network error không được thành 404; related lỗi trả `[]`; image batch lỗi phải được truyền lên, không giả ảnh rỗng.
- [ ] Chạy `node --import tsx --test test/public-album-page-errors.test.ts`, xác nhận đỏ do hành vi cần bổ sung.
- [ ] Tách fetching khỏi UI; cache truy vấn album theo request để metadata và page không tạo kết quả mâu thuẫn. Related là tùy chọn; album và batch ảnh đầu là bắt buộc. Giữ các request độc lập chạy song song.
- [ ] Áp dụng cùng phân loại lỗi trong metadata và page, không dùng catch-all trả metadata “Album không tìm thấy”. Logic cốt lõi:

```ts
catch (error) {
  if (error instanceof ApiError && error.status === 404) notFound()
  throw error
}
```

- [ ] Chỉ bọc truy vấn album chính bằng nhánh `notFound`; lỗi image batch, kể cả 404, không được bị nhánh đó bắt nhầm. Related fallback phải có log không chứa secrets.
- [ ] Chạy test mới và regression; test HTTP trên production-mode local với API stub. Xác nhận album tồn tại + related 500 vẫn render, album mất có noindex/404, lỗi upstream không sinh noindex “không tìm thấy”. Kiểm tra status trước streaming; không chỉ assert nội dung JSX.

**Done:** Lỗi phụ không làm mất trang chính; lỗi tạm thời không bị diễn giải thành nội dung đã xóa.

## Task 2 — Sitemap toàn vẹn khi upstream lỗi

**Files:**

- Modify: `apps/frontend/src/app/sitemap.ts`.
- Create: `apps/frontend/src/lib/server/public-sitemap.ts`.
- Create: `apps/frontend/test/public-sitemap.test.ts`.
- Regression: `apps/frontend/test/seo-indexing.contract.test.ts`.

**Interfaces:** `loadPublicSitemap(): Promise<MetadataRoute.Sitemap>`; chỉ resolve khi cả chuỗi trang album và danh mục tải hoàn chỉnh. Export thêm `loadPublishedAlbumCatalog(): Promise<Album[]>` để Task 6 dùng chung catalog public có `id`, `slug`, `imageCount`, timestamps thay vì suy ngược từ XML. Route giữ `revalidate = 60`.

- [ ] Test: API lỗi ở trang album thứ hai phải reject; categories lỗi phải reject; cursor lặp phải reject; URL trùng được dedupe; published active mới xuất hiện; `lastModified` lấy từ nội dung.
- [ ] Chạy `node --import tsx --test test/public-sitemap.test.ts` để xác nhận test đỏ.
- [ ] Tách builder, bỏ `catch -> staticPages`; log rồi rethrow. Theo dõi cursor đã thấy, validate `hasMore` phải có nextCursor, không âm thầm công bố dữ liệu thiếu. Album/danh mục vẫn fetch song song.

```ts
if (pagination.hasMore && !pagination.nextCursor) {
  throw new Error('SITEMAP_INCOMPLETE_PAGE')
}
if (pagination.nextCursor && seenCursors.has(pagination.nextCursor)) {
  throw new Error('SITEMAP_CURSOR_LOOP')
}
```

- [ ] Kiểm thử warm-cache: tạo sitemap thành công, làm upstream lỗi, chờ đủ revalidation trong harness, xác nhận vẫn nhận bản hoàn chỉnh trước đó. Cold-cache lỗi không được trả sitemap tĩnh 200; lỗi build/cold request phải được báo rõ.
- [ ] Bật lại upstream, kiểm tra lần revalidate kế tiếp cập nhật; album chuyển draft bị loại sau refresh thành công. Đo riêng restart/redeploy, ghi rõ giới hạn cache.
- [ ] Nếu bản Next/deployment thực tế không giữ bản tốt qua revalidation lỗi, dừng riêng task ở bằng chứng này để thiết kế cache bền vững; không thay bằng biến module hoặc trả sitemap rỗng.
- [ ] Chạy test sitemap + SEO hiện có; ghi quy trình kiểm tra số URL và log lỗi trong runbook Task 9.

**Done:** Không có HTTP 200 chứa sitemap bị rút gọn do lỗi upstream. Không coi giảm số URL là lỗi chắc chắn vì có thể là unpublish hợp lệ.

## Task 3 — Review policy và danh tính doanh nghiệp nhất quán

**Files:**

- Create: `apps/frontend/src/config/business.ts`.
- Modify: `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/(public)/lien-he/page.tsx`, `apps/frontend/src/app/(public)/bang-gia/PricingClient.tsx`, `apps/frontend/src/app/components/common/SocialSection.tsx`.
- Create: `apps/frontend/test/business-seo.test.ts`.

**Interfaces:** Export `businessProfile` chứa tên hiển thị, điện thoại, địa chỉ, giờ mở cửa và social đã duyệt. Schema doanh nghiệp dùng chung `@id = absoluteUrl('/#business')`; các provider tham chiếu entity này.

- [ ] Ghi rõ hai bộ social hiện khác nhau: root/SocialSection dùng `nguyendinhthinh.foto`, trang liên hệ dùng `ndtstudio`. Xác nhận tài khoản thực trước khi thay; không tự đoán bộ nào đúng.
- [ ] Viết test ngăn khuyến mãi đổi lấy đánh giá, kiểm tra cùng business identity giữa trang chủ/liên hệ/bảng giá và không có AggregateRating tự tạo.
- [ ] Chạy `node --import tsx --test test/business-seo.test.ts`, xác nhận đỏ.
- [ ] Thay khối ưu đãi bằng: “Nếu bạn đã sử dụng dịch vụ, hãy chia sẻ trải nghiệm thực tế của mình trên Google Maps.” Không yêu cầu số sao, không tặng ưu đãi.
- [ ] Tập trung thông tin đã xác nhận vào config; nối schema bằng `@id`, dùng thông tin trùng khớp phần hiển thị. Không đổi giá, giờ làm hoặc địa chỉ chỉ để cải thiện SEO.
- [ ] Test xanh; parse JSON-LD từ HTML, kiểm tra bằng Rich Results Test khi có URL/bản HTML phù hợp; browser kiểm tra liên hệ trên mobile/desktop.

**Done:** Không còn review có thưởng trong mã hoạt động; business schema không mâu thuẫn với thông tin hiển thị. Thiếu xác nhận social chỉ chặn phần social, không chặn bỏ ưu đãi review.

## Task 4 — Ảnh chia sẻ và metadata mặc định

**Files:**

- Create: `apps/frontend/src/app/og/route.tsx`.
- Modify: `apps/frontend/src/lib/seo.ts`, `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/(public)/thu-vien/[slug]/page.tsx`, `apps/frontend/src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx`.
- Create: `apps/frontend/test/social-metadata.test.ts`.

**Interfaces:** `GET /og` trả PNG 1200×630 bằng `ImageResponse` của Next, chỉ dùng tên thương hiệu, text và asset nội bộ. Không gọi dịch vụ tạo ảnh, không tải ảnh album ngẫu nhiên. Helper metadata nhận `image?: string`, dùng `absoluteUrl('/og')` làm fallback.

- [ ] Test metadata của trang chủ/dịch vụ/danh mục có OG + Twitter title/description/image phù hợp; album có cover dùng cover, không cover dùng fallback.
- [ ] Chạy `node --import tsx --test test/social-metadata.test.ts`, xác nhận đỏ.
- [ ] Tạo endpoint ảnh thương hiệu, thay tham chiếu `/og-image.jpg` thiếu file. Khai báo ảnh ngay trong metadata cấp con để không mất do shallow merge Open Graph.
- [ ] Không khai báo cover album luôn là 1920×1080: dùng kích thước biến thể thật hoặc bỏ width/height khi chưa biết. Không nhân kích thước ảnh gốc vào biến thể đã resize.
- [ ] Test xanh; GET ảnh trả đúng MIME/kích thước; xem ảnh để kiểm tra dấu tiếng Việt và cắt chữ. Kiểm tra HTML với user-agent preview bot, không chỉ xem object metadata.

**Done:** Mọi trang trọng điểm có preview hợp lệ, album vẫn giữ ảnh riêng. Đây là cải thiện chia sẻ, không hứa tăng hạng trực tiếp.

## Task 5 — Phân trang crawlable, giữ infinite scroll

**Files:**

- Modify backend: `apps/backend/src/albums/dto/query-albums.dto.ts`, `apps/backend/src/albums/albums.service.ts`, `apps/backend/src/albums/albums.service.spec.ts`.
- Modify frontend: `apps/frontend/src/app/(public)/thu-vien/page.tsx`, `apps/frontend/src/app/(public)/thu-vien/GalleryClient.tsx`, `apps/frontend/src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx`, `apps/frontend/src/app/(public)/thu-vien/danh-muc/[slug]/category-data.ts`, `apps/frontend/src/lib/public-gallery-swr.ts`.
- Create: `apps/frontend/src/lib/gallery-pagination.ts`, `apps/frontend/test/gallery-pagination.test.ts`, `apps/frontend/test/seo-pagination.browser.spec.ts`.

**Interfaces:** Bổ sung semantics cho public `GET /albums?sortBy=gallery&page=N&limit=8`. Không truyền `page` thì hành vi cursor giữ nguyên. Có `page` và `cursor` cùng lúc trả 400. Trả thêm `page`, `totalPages`, `total`; vẫn có nextCursor cho infinite scroll.

- [ ] Backend test fixture 17 album: page 1/2/3 trả lần lượt 8/8/1, không trùng khi dataset đứng yên; sort khớp gallery hiện tại; bộ lọc category giống nhau; draft/archived không lọt; page invalid bị từ chối; Admin pagination không đổi.
- [ ] Chạy từ `apps/backend`: `npm test -- --runInBand --runTestsByPath src/albums/albums.service.spec.ts`, xác nhận test mới đỏ.
- [ ] Trong nhánh public `sortBy === 'gallery'`, dùng `(page - 1) * limit` khi page tồn tại; nếu không thì dùng cursor hiện hành. Dùng cùng sortedCandidates, không thay thứ tự nghệ thuật. Dataset thay đổi có thể dịch trang; không cam kết snapshot qua nhiều request.
- [ ] Frontend test bảng URL: không query -> trang 1; `?page=1` -> permanent redirect URL gốc; `?page=2` -> tự canonical; số âm/0/số thập phân/NaN/nhiều giá trị -> 404; vượt trang cuối -> 404, trừ gallery gốc rỗng hiện hành.
- [ ] Đọc `searchParams` ở server; fetch đúng page và category. Title trang sau thêm “- Trang N”, không nhân tên thương hiệu. Không đưa query tracking vào canonical.
- [ ] Render `<a href="?page=2">Trang tiếp theo</a>` thật trong HTML và link quay lại; người dùng tắt JS vẫn điều hướng được. Trang đầu vẫn SSR 8 album.
- [ ] SWR key phải có page khởi đầu và category; hydrate page N rồi tiếp tục bằng nextCursor của N. Chuyển category/page phải reset đúng, không trộn cache page 1/2. Link trang tiếp theo cập nhật theo batch cuối đã tải; không dùng lịch sử giả cho từng card.
- [ ] Chạy backend/frontend tests, rồi browser test JS bật/tắt, mở thẳng page 2, refresh, back, cuộn, chuyển category. Assert canonical, album IDs, link HTML và số request; không chỉ snapshot source.
- [ ] Giữ sitemap chính tập trung trang gốc/danh mục/album. Không cần liệt kê mọi trang phân trang nếu liên kết đã crawlable. Tag landing giữ nguyên trong đợt này; ghi rõ phạm vi, không tuyên bố đã sửa mọi infinite scroll.

**Done:** Có thể khám phá toàn bộ album qua main/category HTML links mà không thao tác cuộn. Không làm hỏng infinite scroll hoặc Admin.

## Task 6 — Sitemap ảnh độc lập

**Files:**

- Create: `apps/frontend/src/app/image-sitemap.xml/route.ts`, `apps/frontend/src/app/image-sitemaps/[albumId]/route.ts`.
- Create: `apps/frontend/src/lib/server/image-sitemap.ts`, `apps/frontend/test/image-sitemap.test.ts`.
- Modify: `apps/frontend/src/app/robots.ts`.
- Read: `apps/frontend/src/lib/api/images.ts`, `apps/backend/src/images/images.service.ts`, `apps/backend/src/images/image-url.service.ts`.

**Interfaces:** `/image-sitemap.xml` là sitemap index; mỗi `/image-sitemaps/{albumId}` là XML urlset cho một album published active. Dùng `getAlbumImages(albumId)` hiện có sau khi xác nhận endpoint thực sự lọc quyền public. Không đổi batch 4 ảnh của UI.

- [ ] Test XML escape URL có `&`, loại draft/deleted/processing images, empty album, image API lỗi, missing album, duplicate image URL, invalid identifier. Không expose object keys, credentials hoặc original private URLs.
- [ ] Chạy `node --import tsx --test test/image-sitemap.test.ts`, xác nhận đỏ.
- [ ] Index lấy catalog album hoàn chỉnh từ Task 2, không gọi N API ảnh trong request index. Child resolve albumId trong catalog đã cache để lấy slug, kiểm tra lại bằng `getAlbum(slug)` public rồi gọi ảnh của riêng album; không truyền albumId vào API vốn nhận slug. Serialize XML namespace image chuẩn, URL trang album là canonical `.com.vn`, image URL giữ đúng CDN hiện tại.
- [ ] Mỗi child liệt kê tối đa 1.000 ảnh public theo thứ tự gallery; giới hạn này phải được ghi trong report, không tuyên bố bao phủ toàn bộ nếu album vượt giới hạn. Nếu dữ liệu thực có album >1.000 ảnh, chốt thiết kế shard bổ sung trước khi đánh dấu bao phủ đầy đủ.
- [ ] Missing/non-public album -> 404; API lỗi -> lỗi server, không XML rỗng 200. Cache/revalidate theo chiến lược Task 2, kiểm thử cả warm và cold. Không cần xác minh quyền bằng admin token.
- [ ] Thêm cả sitemap trang và sitemap ảnh vào robots. Kiểm tra index <=50.000 child URLs và XML <=50 MB chưa nén; vượt giới hạn là gate cần sharding, không cắt âm thầm.
- [ ] Test xanh, parse XML bằng parser, GET một ảnh ngoài batch 4 ảnh đầu không cookie/auth. Kiểm tra CDN robots và HTTP; Search Console domain CDN chỉ thực hiện khi được cấp quyền.

**Done:** Google có danh sách ảnh công khai ngoài batch đầu; sitemap ảnh không làm tăng payload SSR trang album. Độ phủ báo bằng số thật, không mặc định tất cả ảnh đã index.

## Task 7 — Nội dung dịch vụ địa phương và alt text

**Files:**

- Create: `docs/seo/local-content-matrix.md`, `apps/frontend/test/local-seo-content.test.ts`.
- Modify sau duyệt: `apps/frontend/src/app/(public)/page.tsx`; các `layout.tsx` và `page.tsx` thuộc `bang-gia/{ca-nhan,couple,gia-dinh,team,video,wedding}`; `apps/frontend/src/app/(public)/gioi-thieu/dich-vu/components/ServiceComponent.tsx`.
- Audit: component ảnh dưới `apps/frontend/src/app/(public)/gioi-thieu`, `lien-he`; category descriptions trong Admin là nội dung DB, không hard-code taxonomy để né cập nhật dữ liệu.

**Interfaces:** Ma trận có URL, intent, title, description, H1, copy hiển thị, link album/bảng giá/đặt lịch, nguồn xác minh, trạng thái duyệt.

- [x] Lập ma trận dự thảo từ trang hiện có; ví dụ trang chủ “Studio chụp ảnh tại Nha Trang | NDT Studio”, cá nhân “Chụp ảnh cá nhân tại Nha Trang - Bảng giá | NDT Studio”. Đây là đề xuất, không phải kết quả keyword-volume research.
- [x] Với từng dịch vụ ghi nội dung có thể xác minh: đối tượng phù hợp, phong cách, phần bao gồm trong gói, cách đặt lịch. Không tự thêm giá, makeup, số ảnh chỉnh sửa, thời gian giao ảnh hoặc lời hứa chưa có nguồn.
- [x] Người dùng đã duyệt hướng copy; danh mục dùng description hiện có, không tự publish cập nhật DB. Giữ album descriptions nguyên trạng.
- [x] Viết test title/canonical không lặp thương hiệu, không trùng toàn bộ giữa dịch vụ; HTML có heading chính và các liên kết thật tới category tồn tại, bảng giá, liên hệ.
- [x] Chạy `node --import tsx --test test/local-seo-content.test.ts`, rồi áp dụng bản copy source-backed đã duyệt.
- [x] Kiểm tra từng ảnh trước khi viết alt: ảnh thông tin mô tả nội dung, ảnh trang trí dùng alt rỗng. Không thay hàng loạt tên file bằng từ khóa Nha Trang, không đoán chủ thể từ `ip-1`.
- [ ] Chạy tests, kiểm tra mobile/desktop và navigation. H2/H3 cho mục con/card khi phù hợp; không mô tả nhiều H1 là một “hình phạt Google”.

**Done locally:** Các trang dịch vụ có nội dung riêng, trung thực, liên kết đến tác phẩm và đặt lịch. Không sinh hàng loạt landing page na ná nhau. Browser/mobile và production verification còn chờ release.

## Task 8 — Responsive images và Core Web Vitals

**Files:**

- Modify: `apps/frontend/src/app/(public)/thu-vien/GalleryClient.tsx`, `apps/frontend/src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx`.
- Create: `apps/frontend/src/lib/responsive-image.ts`, `apps/frontend/test/responsive-image.test.ts`.
- Audit có điều kiện: `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/components/layout/Hero.tsx`.

**Interfaces:** `getResponsiveImageProps(image: Image, sizes: string)` trả `src`, `srcSet`, `sizes`, `width`, `height` khi biết kích thước. Dùng URL imgproxy có sẵn, không ghép URL giả hoặc chuyển toàn bộ sang next/image ngoài scope.

- [ ] Đo baseline mobile/desktop cùng URL/dataset/cache/network bằng 3 lượt mỗi route; ghi median LCP/CLS và tổng image bytes. INP thực địa cần dữ liệu người dùng, không gắn nhãn lab TBT thành INP.
- [ ] Test ảnh ngang 2400×1600, ảnh dọc 1600×2400, ảnh nhỏ, thiếu kích thước. imgproxy resize fit 800×800 không có nghĩa ảnh dọc rộng 800px; không gắn width descriptor sai.
- [ ] Chạy `node --import tsx --test test/responsive-image.test.ts`, xác nhận đỏ. Inspect hành vi upscale/cấu hình imgproxy trước khi tính width biến thể; nếu chưa biết thì chỉ dùng variant phù hợp, không bịa srcset descriptor.
- [ ] Dùng small/medium/large đúng kích thước; khi đủ thông tin khai báo srcset/sizes và tỷ lệ giữ chỗ. Giữ chất lượng lightbox bằng large/xlarge, không đổi object key hoặc ảnh gốc.
- [ ] Chỉ preload/eager ảnh được xác định là LCP của từng route, không toàn bộ grid. Ảnh dưới màn hình lazy-load. Không đảo lại progressive loading/slot ổn định đã có ở album.
- [ ] Chạy test xanh và browser responsive 390px/768px/1440px, mạng chậm, cache lạnh; kiểm tra cắt ảnh, lightbox, cuộn tải tiếp, layout shift.
- [ ] Đo lại cùng điều kiện. Mục tiêu lab không hồi quy và giảm bytes ở viewport nhỏ; mục tiêu field p75: LCP <=2,5s, INP <200ms, CLS <0,1. Chưa có dữ liệu field thì ghi chưa đủ bằng chứng.
- [ ] Chỉ giảm font/animation nếu trace chỉ ra chi phí đáng kể và người dùng duyệt thay đổi visual; không xóa font hàng loạt.

**Done:** Có bằng chứng trước/sau; không đánh đổi ảnh mất nét hoặc phá bố cục để lấy điểm Lighthouse.

## Task 9 — Nghiệm thu, rollout và đo kết quả

**Files:** Create `docs/runbooks/seo-verification.md`, `docs/qa/2026-09-17-seo-results.md`; reference `docs/runbooks/domain-migration-com-vn.md`.

**Interfaces:** Không tự tạo analytics property, external monitor hay lịch tự động. Runbook là hướng dẫn cho người triển khai, không phải quyền triển khai.

- [ ] Chạy toàn bộ frontend tests: từ `apps/frontend`, `npm test`; typecheck `npx tsc --noEmit --incremental false`; `npm run build`. Ghi đầy đủ exit code và môi trường, phân biệt lỗi baseline với regression.
- [ ] Với backend Task 5, chạy test album/gallery/public-read, sau đó full `npm test -- --runInBand` và `npm run build` từ `apps/backend`. Không dùng `lint --fix` làm kiểm tra read-only.
- [ ] Chạy `git diff --check` và review diff theo từng task. Không commit/push tự động.
- [ ] Browser/HTTP QA: trang chính, album thiếu, category rỗng, phân trang JS on/off, ảnh preview, XML, lỗi API, recovery ISR, mobile. Nếu thiếu môi trường thì ghi task chưa nghiệm thu, không coi source test thay thế.
- [ ] Chuẩn bị rollout theo đợt: backend pagination trước frontend consumer; các task còn lại triển khai độc lập khi được duyệt. Không bỏ API cursor cũ.
- [ ] Rollback bằng artifact/revision trước đã xác định qua quy trình deploy, không reset worktree. Rollback metadata/copy độc lập; không cần restore DB vì plan không sửa dữ liệu. Khôi phục robots quảng bá sitemap cũ nếu endpoint ảnh bị rollback.
- [ ] Sau khi được phép deploy: chạy lại domain gate, HTML/status, OG, sitemap và ảnh CDN trên production. Chỉ sau đó mới submit sitemap/URL Inspection/Change of Address nếu thực sự còn cần; kiểm tra trạng thái hiện có để tránh lặp thao tác.
- [ ] Lập baseline Search Console theo nhóm dịch vụ/danh mục/album và Search type Image: clicks, impressions, CTR, queries, Google-selected canonical, indexing exclusions. Không coi các URL redirect/noindex chủ ý là lỗi.
- [ ] Đề xuất báo cáo ở mốc 14 và 28 ngày sau deploy, so sánh cùng độ dài khoảng thời gian và ghi ảnh hưởng chuyển domain/mùa vụ. Đây là lịch trong runbook, không tạo automation trong lần lập plan.
- [ ] Đo conversion: kiểm kê công cụ analytics hiện có trước. Nếu đã có và được duyệt, map sự kiện `contact_click` với `channel: phone | zalo | booking` và `page_path`; không gửi số điện thoại cá nhân/form content. Click chỉ là proxy, không gọi là đặt lịch thành công. Nếu chưa có analytics, xin chọn provider/consent trước khi cài.

**Done:** Báo cáo phân biệt rõ “code đã kiểm thử”, “đã deploy”, “Google đã đọc” và “hiệu quả kinh doanh”. Không hứa timeline index hoặc thứ hạng.

## Checklist duyệt trước khi thực thi

- [ ] Duyệt đợt 1: xử lý lỗi + sitemap + review policy + social preview.
- [ ] Xác nhận social chính thức trước phần thống nhất businessProfile.
- [ ] Duyệt phần bổ sung API/URL phân trang của đợt 2.
- [ ] Duyệt ma trận nội dung trước đợt 3; không thêm mô tả album hàng loạt.
- [ ] Quyền deploy, Cloudflare, Search Console và analytics tách riêng khỏi quyền sửa mã.

## Nguồn tham khảo

- [Google: Pagination](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading) — URL riêng và liên kết crawlable cho các trang tiếp theo.
- [Google: Image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps) — namespace, CDN và giới hạn ảnh trên URL.
- [Next.js: ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration) — cơ chế phục hồi khi regeneration lỗi; phải kiểm thử với phiên bản/deployment thực tế.
- [Google: Reviews](https://support.google.com/business/answer/3474122?hl=en) — không trao ưu đãi đổi lấy review.
- [Google: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — chỉ số trải nghiệm, không bảo đảm xếp hạng.
