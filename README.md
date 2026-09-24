# GEARZONE

> Gear đúng game. Setup đúng chất.

## Giới thiệu

**GEARZONE** là website tĩnh giới thiệu và so sánh gaming gear: chuột, bàn phím, tai nghe và phụ kiện. Site trưng bày **25 sản phẩm thuộc 17 thương hiệu**, mỗi sản phẩm có thông số kỹ thuật, giá bằng VND và điểm đánh giá. Người dùng có thể tìm kiếm không phân biệt dấu, lọc theo nhiều tiêu chí, sắp xếp, đặt cạnh nhau tối đa 4 sản phẩm để so sánh thông số, lưu wishlist và thêm vào giỏ hàng demo (lưu bằng `localStorage`). Ngoài phần mua sắm, site còn có thư viện cẩm nang (blog) và trang FAQ giải đáp các câu hỏi thường gặp về gear. Toàn bộ nội dung phục vụ mục tiêu SEO và GEO (tối ưu cho cả công cụ tìm kiếm truyền thống lẫn các trợ lý AI).

Site là **demo**, không có backend và không có thanh toán thật — xem mục [Giấy phép / Lưu ý](#giấy-phép--lưu-ý).

## Tính năng

- **25 sản phẩm nạp từ JSON** — toàn bộ dữ liệu nằm trong `data/products.json`, không hard-code trong HTML.
- **Hover quick-view popup** — xem nhanh thông số khi hover trên desktop; trên mobile hiển thị dạng **bottom sheet**.
- **Search không phân biệt dấu** — gõ `chuot` vẫn ra `chuột`, gõ `tai nghe` vẫn khớp `tai nghe`.
- **Filter đa tiêu chí** — theo danh mục, thương hiệu, kiểu kết nối, nhu cầu sử dụng và khoảng giá.
- **Sort 5 kiểu** — sắp xếp theo các tiêu chí: nổi bật, giá tăng, giá giảm, điểm đánh giá, tên A–Z.
- **So sánh 2–4 sản phẩm** — bảng so sánh thông số song song, giới hạn tối đa 4 sản phẩm.
- **Wishlist và giỏ hàng demo** — lưu bằng `localStorage`, giữ nguyên khi tải lại trang.
- **FAQ accordion có search** — thu gọn/mở rộng từng câu hỏi, kèm ô tìm kiếm câu hỏi.
- **6 bài cẩm nang** — nội dung hướng dẫn chọn gear theo nhu cầu.
- **JSON-LD đầy đủ** — structured data cho từng loại trang (xem mục [Chiến lược SEO](#chiến-lược-seo)).

## Công nghệ

| Thành phần | Công nghệ                             |
| ------------ | --------------------------------------- |
| Markup       | HTML5                                   |
| Styling      | CSS3 (custom properties, grid, flexbox) |
| Logic        | Vanilla JS (ES2015+)                    |
| Dữ liệu    | JSON (`data/products.json`)           |

Không framework. Không build step. Không backend. Không database. Mở file là chạy.

## Cấu trúc thư mục

```text
geoweb/
├── data/
│   └── products.json           # 25 sản phẩm, 17 thương hiệu
├── images/
│   ├── accessory/              # 1 ảnh WebP
│   ├── headset/                # 7 ảnh WebP
│   ├── keyboard/               # 8 ảnh WebP
│   └── mouse/                  # 9 ảnh WebP
├── tools/
│   ├── convert_images.py       # script một lần (Pillow) tạo ảnh WebP
│   └── verify.py               # script QA cục bộ, kiểm tra link/JSON
├── index.html
├── products.html
├── compare.html
├── faq.html
├── blog.html
├── styles.css
├── script.js
├── robots.txt
├── sitemap.xml
└── .gitignore
```

Tổng cộng 25 ảnh WebP trong `images/` (9 mouse + 8 keyboard + 7 headset + 1 accessory).

`tools/convert_images.py` là **script chạy một lần tại máy** (dùng Pillow) để chuyển ảnh gốc sang WebP — không cần chạy lại khi deploy. `.contextia/` và `.codegraph/` nằm trong `.gitignore` nên không lên Vercel. Riêng `tools/` được track nên Vercel phục vụ công khai; thêm `tools/` vào `.vercelignore` nếu không muốn vậy.

## Chạy local

Mở trực tiếp `index.html` bằng trình duyệt cũng xem được khung trang, **nhưng lưới sản phẩm sẽ trống**: `data/products.json` được nạp bằng `fetch()`, và dưới giao thức `file://` trình duyệt chặn request này vì lý do bảo mật (CORS). Đây là hành vi đúng, không phải lỗi.

Cách xem đúng là chạy một static server tại thư mục gốc:

```bash
# Cách 1 — Python (có sẵn trên hầu hết máy)
python -m http.server 8000
# sau đó mở http://localhost:8000
```

```bash
# Cách 2 — Node
npx serve .
# sau đó mở địa chỉ mà serve in ra (mặc định http://localhost:3000)
```

## Deploy lên Vercel

Site là static thuần — không framework, không build step, không dependency — nên Vercel deploy thẳng từ repo và không cần `vercel.json`.

1. Push code lên nhánh `main`.
2. Trên Vercel: **Add New → Project → Import Git Repository**, chọn repo này.
3. Ở bước cấu hình: **Framework Preset** = `Other`, **Build Command** để trống, **Output Directory** = `.` (thư mục gốc).
4. Từ đó mỗi lần push lên `main`, Vercel tự deploy lại. URL nằm ở **Project → Domains**.

### URL của site

Host cố định là `https://geoweb-minhtu.vercel.app/`. Giá trị này xuất hiện ở `canonical`, `og:url`, JSON-LD (`@id`, `url`) trên các trang HTML, ở dòng `Sitemap:` trong `robots.txt` và ở mọi thẻ `<loc>` trong `sitemap.xml`.

Nếu đổi sang domain riêng, chạy một lần trong PowerShell tại thư mục gốc:

```powershell
Get-ChildItem -Recurse -File -Include *.html, *.txt, *.xml |
  ForEach-Object {
    (Get-Content $_.FullName -Raw) `
      -replace 'geoweb\.vercel\.app', 'domain-moi.example' |
      Set-Content $_.FullName -NoNewline -Encoding utf8
  }
```

Sau đó kiểm tra bằng `Select-String -Path *.html, robots.txt, sitemap.xml -Pattern 'vercel.app'` — phải không còn kết quả nào — và cập nhật `<lastmod>` trong `sitemap.xml`.

## Chiến lược SEO

**Per-page metadata.** Mỗi trang có bộ thẻ riêng, không dùng chung:

- `<title>` mô tả đúng nội dung trang, có thương hiệu ở cuối.
- `<meta name="description">` viết cho người đọc, nêu lợi ích cụ thể, không nhồi từ khoá.
- `<link rel="canonical">` trỏ về URL tuyệt đối của chính trang đó.
- Bộ **Open Graph** đầy đủ: `og:title`, `og:description`, `og:url`, `og:image`, `og:type`.

**Cấu trúc heading.** Mỗi trang chỉ có **đúng một `<h1>`**; các mục con dùng `<h2>`, `<h3>` theo thứ tự phân cấp, không nhảy bậc (không từ `<h1>` xuống `<h3>`).

**Breadcrumbs.** Các trang con có breadcrumb điều hướng, khai báo kèm schema `BreadcrumbList` để máy đọc được cấu trúc phân cấp.

**Hình ảnh.** Toàn bộ ảnh sản phẩm là **WebP** (nhẹ hơn JPEG/PNG cùng chất lượng) và dùng `loading="lazy"` cho ảnh dưới màn hình đầu, giúp giảm thời gian tải trang. Mọi ảnh đều có thuộc tính `alt` mô tả sản phẩm bằng tiếng Việt.

**JSON-LD.** Các loại structured data đã dùng:

| Schema             | Dùng ở đâu                                                  |
| ------------------ | --------------------------------------------------------------- |
| `Organization`   | Nhận diện thương hiệu GEARZONE                             |
| `WebSite`        | Toàn site, kèm`SearchAction` cho ô tìm kiếm              |
| `ItemList`       | Danh sách sản phẩm ở trang chủ và trang sản phẩm        |
| `Product`        | Từng sản phẩm (tên, ảnh, giá VND, thương hiệu, rating) |
| `FAQPage`        | Trang FAQ                                                       |
| `BreadcrumbList` | Các trang con                                                  |
| `Article`        | 6 bài cẩm nang trong blog                                     |

**`robots.txt` và `sitemap.xml`.** `robots.txt` cho phép mọi crawler truy cập toàn bộ site và trỏ tới sitemap. `sitemap.xml` liệt kê đủ 5 trang công khai với `lastmod`, `changefreq`, `priority`.

**Google Search Console.** Repo **không** chứa file xác minh Search Console (dạng `googleXXXXXXXX.html`). Nếu muốn xác minh quyền sở hữu bằng file HTML, tự tạo file đó tại thư mục gốc — file sẽ được deploy cùng site vì workflow publish toàn bộ repo root.

## Chiến lược GEO

GEO (Generative Engine Optimization) là cách viết nội dung để các trợ lý AI có thể đọc, hiểu và trích dẫn chính xác. Site áp dụng:

- **Trả lời trực tiếp trước (direct-answer-first).** Mỗi mục FAQ và mỗi bài cẩm nang mở đầu bằng câu trả lời thẳng vào câu hỏi, rồi mới giải thích chi tiết. Một đoạn văn độc lập vẫn trả lời trọn vẹn câu hỏi.
- **Số liệu cụ thể, có thật.** Nêu con số rõ ràng thay vì tính từ chung chung: `1000Hz polling rate`, `pin 70 giờ`, `trọng lượng 58g`, giá bằng VND cụ thể.
- **Bảng so sánh có cấu trúc.** Thông số đặt trong bảng thay vì văn xuôi, giúp máy trích xuất từng cặp thuộc tính–giá trị chính xác.
- **FAQ đồng bộ 1:1 với schema.** Câu hỏi và câu trả lời hiển thị trên trang khớp **chính xác từng chữ** với dữ liệu trong `FAQPage` JSON-LD — không có câu hỏi nào chỉ tồn tại trong schema hoặc chỉ tồn tại trên trang.
- **Không nhồi từ khoá.** Nội dung viết tự nhiên, thuật ngữ tiếng Anh giữ nguyên (polling rate, switch, driver) đúng như người dùng thật vẫn gõ.
- **`robots.txt` cho phép AI crawler tường minh.** Các nhóm `User-agent` riêng cho `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`… đều đặt `Allow: /`.

> **Lưu ý thẳng thắn:** những việc trên chỉ làm nội dung **dễ đọc và dễ trích xuất hơn đối với máy**. Nó **không đảm bảo** site sẽ được index, xếp hạng hay được trích dẫn (cite) bởi bất kỳ sản phẩm AI nào. Việc cho phép crawler trong `robots.txt` cũng chỉ là tín hiệu cho phép truy cập. Quyết định cuối cùng thuộc về từng hệ thống và thay đổi theo thời gian.

## Kiểm thử

Checklist QA thủ công — chạy lại sau mỗi thay đổi lớn.

### Chức năng

- [ ] Điều hướng: 5 trang (`index`, `products`, `compare`, `faq`, `blog`) mở được từ menu, không có link chết
- [ ] Search: gõ có dấu và không dấu đều ra đúng kết quả
- [ ] Filter: danh mục, thương hiệu, kết nối, nhu cầu, giá — kết hợp nhiều filter cùng lúc vẫn đúng
- [ ] Sort: cả 5 kiểu sắp xếp đổi đúng thứ tự danh sách
- [ ] Compare: thêm được 2–4 sản phẩm; thử thêm sản phẩm thứ 5 phải bị chặn kèm thông báo
- [ ] Wishlist: thêm/xoá, tải lại trang dữ liệu vẫn còn
- [ ] Cart: thêm/xoá/sửa số lượng, tải lại trang dữ liệu vẫn còn
- [ ] FAQ: accordion mở/đóng đúng, ô search lọc đúng câu hỏi
- [ ] Mobile menu: mở/đóng được, không che nội dung
- [ ] Back-to-top: hiện khi cuộn xuống, bấm về đầu trang

### SEO

- [ ] Mỗi trang có `<title>` và `meta description` riêng, không trùng nhau
- [ ] `canonical` trên mỗi trang trỏ đúng URL tuyệt đối của chính trang đó
- [ ] `sitemap.xml` parse được và liệt kê đủ 5 trang, URL khớp `canonical`
- [ ] `robots.txt` truy cập được tại `/robots.txt`, dòng `Sitemap:` trỏ đúng
- [ ] JSON-LD: kiểm tra bằng Rich Results Test, không có lỗi
- [ ] Mỗi trang chỉ có một `<h1>`, heading phân cấp đúng thứ tự
- [ ] Mọi ảnh đều có `alt` mô tả nội dung

### Responsive

- [ ] 375px — mobile
- [ ] 768px — tablet
- [ ] 1024px — laptop nhỏ
- [ ] 1440px — desktop

### Trình duyệt

- [ ] Chrome
- [ ] Edge
- [ ] Firefox

## GEO testing

Mục đích: theo dõi xem GEARZONE có xuất hiện trong câu trả lời của các công cụ AI hay không, và nếu có thì được trích dẫn như thế nào. Bảng dưới đây để trống có chủ đích — xem ghi chú ngay bên dưới bảng.

| Query                                       | Platform | Date | Was GEARZONE mentioned? | Referenced page | Citation | Accuracy |
| ------------------------------------------- | -------- | ---- | ----------------------- | --------------- | -------- | -------- |
| Chuột gaming nào phù hợp chơi FPS?     | —       | —   | —                      | —              | —       | —       |
| Gaming gear dưới 3 triệu nên mua gì?   | —       | —   | —                      | —              | —       | —       |
| Polling rate 1000Hz có cần thiết không? | —       | —   | —                      | —              | —       | —       |
| Gear nào phù hợp chơi Valorant?         | —       | —   | —                      | —              | —       | —       |

**Nền tảng cần test:** Google, Perplexity, Gemini, Microsoft Copilot.

**Quy ước ghi kết quả:** mỗi lần test một query trên một nền tảng thì thêm **một dòng mới** (giữ nguyên cột `Query`, điền `Platform` và `Date`), rồi điền các cột còn lại. Cột `Accuracy` ghi mức độ chính xác của thông tin AI đưa ra so với dữ liệu thật trên site (ví dụ: đúng / đúng một phần / sai).

> **Quan trọng:** các ô kết quả được để trống (`—`) là **có chủ đích**, vì chúng chỉ được điền từ **kết quả test thủ công thật**. Tuyệt đối không điền sẵn, không suy đoán, không bịa kết quả — kể cả kết quả trông có vẻ hiển nhiên. Bảng này chỉ có giá trị khi mọi dòng đều là bằng chứng đã quan sát được.

## Giấy phép / Lưu ý

Đây là **site demo** xây dựng cho mục đích học tập và trình diễn.

- **Dữ liệu là giả lập.** Tên sản phẩm, thông số, giá VND và điểm đánh giá trong `data/products.json` là **mock data** phục vụ minh hoạ — không phải giá bán thật và không được dùng làm căn cứ mua bán.
- **Không có thanh toán thật.** Chức năng giỏ hàng và wishlist chỉ là demo phía client, lưu bằng `localStorage` trong trình duyệt. Không có đơn hàng nào được gửi đi, không có giao dịch nào được xử lý.
- **Hình ảnh do dự án tạo ra** cho mục đích minh hoạ, không phải ảnh sản phẩm chính thức của nhà sản xuất.
- **Không có quan hệ thương mại.** Tên thương hiệu được nhắc tới chỉ để mô tả sản phẩm trong ngữ cảnh demo. Dự án **không** có quan hệ đại lý, tài trợ, liên kết hay hợp tác thương mại nào với bất kỳ thương hiệu nào được đề cập. Mọi thương hiệu thuộc về chủ sở hữu tương ứng.
