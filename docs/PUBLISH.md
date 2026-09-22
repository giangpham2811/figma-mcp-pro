# Đưa plugin lên Figma Community

Dành cho người **bấm nút publish**. Đọc hết trước khi bấm — mục *Hai chỗ
chặn* ở dưới có thể khiến bạn đổi ý, và đổi ý sau khi publish thì tốn hơn
nhiều.

---

## Hai chỗ chặn, đọc trước

### 1. Tên plugin không được chứa chữ "Figma"

Quy định thương hiệu của Figma nói thẳng:

> *"Don't put our name (or part of our name, e.g., 'Fig') in your company
> name, product name, domain name, or social media handle."*
> — [figma.com/using-the-figma-brand](https://www.figma.com/using-the-figma-brand/)

Đúng: *"Tom's plugin for Figma design"*. Sai: *"Tom's Figma plugin"*.

Tên cũ `Reqwise Figma MCP` vi phạm. Đã đổi trong `plugin/manifest.json`
thành:

```
Reqwise - diagrams for FigJam and Figma design
```

### 2. "Chỉ dùng nội bộ" là một lý do bị từ chối

Figma liệt kê thẳng trong danh sách lý do từ chối:

> *Internal-only use (should be private organization plugins instead)*
> — [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines)

Bản đang chạy trỏ sẵn vào relay của công ty. Người duyệt sẽ cài, chạy, và
thấy một công cụ nối vào hạ tầng của một công ty cụ thể — đúng mô tả của
mục trên.

**Và hệ quả kỹ thuật nặng hơn cả việc bị từ chối:** publish công khai
nghĩa là **plugin của bất kỳ ai trên thế giới cũng quay số vào Cloudflare
Worker của bạn**. Free tier là 100.000 request/ngày cho cả tài khoản. Một
plugin được vài nghìn người cài sẽ ăn hết, và lúc đó nhóm bạn mất công cụ.

Bật `WORKSPACE_KEY` để chặn thì người duyệt không chạy được → cũng bị từ
chối. Không có đường nào đi qua cả hai.

> **Khuyến nghị: publish riêng cho tổ chức, không lên Community.** Không
> qua kiểm duyệt, không lộ ra ngoài, không ai ngoài công ty chạm vào relay,
> mà vẫn được cài-một-cú-bấm và tự cập nhật. Cần gói Organization hoặc
> Enterprise.
>
> Vẫn muốn lên Community thì trước hết **tách relay**: một relay công khai
> riêng cho người ngoài (tự chịu hạn mức), relay công ty giữ nguyên và
> không xuất hiện trong bản publish.

---

## Chuẩn bị sẵn rồi

| Thứ | Ở đâu |
|---|---|
| Icon 128×128 | `assets/icon-128.png` |
| Ảnh bìa 1920×960 | `assets/cover-1920x960.png` |
| Tên hợp quy định | đã sửa trong `plugin/manifest.json` |
| Mô tả | mục dưới, chép thẳng |

`devAllowedDomains` (danh sách localhost) **tự động bị loại khỏi bản
publish**, nên bản phát hành chỉ gọi được relay.

---

## Các bước

1. Figma **bản cài trên máy** → mở file bất kỳ
2. **Plugins → Development → <tên plugin> → Publish…**
3. Điền:
   - **Icon**: `assets/icon-128.png`
   - **Cover art**: `assets/cover-1920x960.png`
   - **Tagline / Description**: chép ở dưới
   - **Tags**: `diagram`, `flowchart`, `userflow`, `requirements`, `AI`
   - **Support contact**: bắt buộc — một email hoặc link. Thiếu là bị trả về
4. **Submit for review**. Vài ngày.

Duyệt xong thì mọi bản cập nhật sau **đăng ngay, không cần duyệt lại**.

---

## Mô tả để chép

**Tagline**

```
Describe a flow in plain language. It draws it, then tells you what the flow is missing.
```

**Description**

```
Reqwise turns a description into a proper diagram on your board or design
file - and then reads the diagram back and tells you what is wrong with it.

Nine kinds: userflow, activity, state machine, sitemap, ERD, sequence,
journey map, persona, use case.

The drawing is the easy half. The useful half is the review: a decision
with only one way out, a screen nothing links to, an actor who starts
nothing. Those are the questions a careful reviewer asks in a meeting, and
you get them while you are still drawing.

It never invents a step. Missing information stays visibly missing,
because a blank on the diagram is a finding, not a defect.

HOW IT WORKS
This plugin is the drawing end of a bridge. An AI assistant that speaks
MCP (Model Context Protocol) sends the model; the plugin draws it in the
file you have open. Nothing is read from or written to any file you do not
have open, and the plugin only runs on files you can edit.

REQUIREMENTS
- Figma desktop app (not the browser)
- Edit access to the file
- An MCP-capable assistant, plus the relay described in the project README

This plugin does nothing on its own. Setup instructions and the open
source code: <ĐIỀN LINK REPO>

PRIVACY
Diagram content (labels, screen names) passes through a relay server on its
way to Figma. It is not stored. Self-hosting the relay is supported and
documented. No Figma credentials are ever sent anywhere: the plugin draws
as you, with your permissions.
```

Đoạn REQUIREMENTS và PRIVACY **đừng bỏ**. Figma yêu cầu nói rõ khi plugin
cần dịch vụ bên thứ ba hoặc chia sẻ dữ liệu ra ngoài, và mô tả thiếu minh
bạch nằm trong danh sách lý do từ chối.

Nhớ thay `<ĐIỀN LINK REPO>` bằng link thật — kho đang **private**, nên phải
mở công khai hoặc trỏ sang một trang hướng dẫn khác. Người duyệt sẽ bấm vào.
