# MeetTogether

Web tìm điểm hẹn (quán cafe / chỗ ăn uống) thuận tiện nhất cho nhiều người ở các vị trí khác nhau.
Phạm vi hiện tại: **TP. Hồ Chí Minh**. Chưa làm các tỉnh/thành khác.

## Stack
- Vite + TypeScript (vanilla, không framework), Leaflet cho bản đồ, Vitest cho test.
- Dữ liệu miễn phí, không cần API key:
  - Tìm địa chỉ: Photon (komoot, dữ liệu OSM), giới hạn bbox HCM.
    Không dùng `*.openstreetmap.org` (Nominatim, tile OSM): mạng dev chặn DNS các domain này.
  - Tile bản đồ: OSM France (`{s}.tile.openstreetmap.fr/osmfr`). Không dùng CARTO: đã bắt API key
    (trả ảnh "API KEY REQUIRED" kèm HTTP 200 — kiểm tra tile phải nhìn ảnh, không chỉ status code).
  - Dữ liệu quán: tải sẵn từ Overpass (`amenity=cafe|restaurant|fast_food|food_court`, vùng HCM)
    vào `public/places-hcm.json` bằng `npm run update-places`. Không gọi Overpass lúc runtime:
    server công khai mất 30–60 s mỗi truy vấn, hay trả 504.
  - Quãng đường: OSRM public `table` API (chỉ lấy `distance`). Thời gian = quãng đường / ~22 km/h (xe máy),
    vì thời gian ô tô của OSRM (~48 km/h) quá lạc quan với HCM.
- Lệnh: `npm run dev`, `npm test`, `npm run build`.

## Cấu trúc
- `src/geo.ts` — logic thuần (khoảng cách, lọc sơ bộ, xếp hạng). Phải có test.
  Không lọc quán theo bán kính quanh "điểm giữa": điểm tối ưu của chế độ fair có thể nằm xa điểm đó.
- `src/api.ts` — gọi Photon / OSRM, đọc dữ liệu quán. Không chứa logic chấm điểm.
- `scripts/fetch-places.mjs` — tải lại dữ liệu quán HCM.
- `src/main.ts` — UI + bản đồ.

## Nguyên tắc làm việc (Karpathy guidelines)

Thiên về cẩn thận hơn tốc độ. Với việc nhỏ, tự cân nhắc.

### 1. Nghĩ trước khi code
- Nói rõ giả định. Không chắc thì hỏi.
- Có nhiều cách hiểu thì trình bày ra, đừng tự chọn âm thầm.
- Có cách đơn giản hơn thì nói. Phản biện khi cần.
- Chỗ nào chưa rõ thì dừng lại, gọi tên điều chưa rõ, rồi hỏi.

### 2. Đơn giản trước tiên
- Code tối thiểu để giải quyết vấn đề. Không thêm tính năng ngoài yêu cầu.
- Không tạo abstraction cho code dùng một lần.
- Không thêm "tuỳ biến", "cấu hình" chưa ai yêu cầu.
- Không xử lý lỗi cho tình huống không thể xảy ra.
- Viết 200 dòng mà 50 dòng đủ thì viết lại.

### 3. Sửa có chủ đích
- Chỉ chạm vào chỗ cần sửa. Không "tiện tay" sửa format, comment, code bên cạnh.
- Giữ style hiện có. Thấy dead code không liên quan thì báo, đừng xoá.
- Xoá import/biến/hàm mà chính thay đổi của mình làm thừa.
- Mỗi dòng thay đổi phải truy được về yêu cầu của người dùng.

### 4. Làm theo mục tiêu kiểm chứng được
- Biến nhiệm vụ thành tiêu chí kiểm chứng: sửa bug → viết test tái hiện rồi làm nó pass.
- Việc nhiều bước thì nêu kế hoạch ngắn: `bước → kiểm chứng bằng gì`.
- Trước khi báo xong: `npm test` và `npm run build` phải pass.
