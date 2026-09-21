---
description: Vẽ diagram nghiệp vụ lên FigJam board đang mở — nói bằng tiếng Việt, chọn loại giúp, kiểm model trước khi vẽ
argument-hint: "<việc cần vẽ> [theo template] [@file nguồn]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs, mcp__reqwise-figma__figma_rules, mcp__reqwise-figma__figma_write
---

# /figjam-pro — $ARGUMENTS

Vẽ lên **FigJam board đang mở** trong Figma Desktop. Yêu cầu viết tự do bằng
tiếng Việt; nhiệm vụ của bạn là chọn đúng loại diagram, dựng model, để tool
kiểm model, rồi vẽ.

## Bước 0 — Kết nối, và đúng bề mặt

```
mcp__reqwise-figma__figma_status
```

- `pluginConnected: false` → dừng lại và nói người dùng: mở Figma Desktop,
  chạy plugin **Reqwise Figma MCP**, giữ cửa sổ plugin mở. Đừng đoán, đừng
  thử vẽ.
- Xem `plugin.editorType`. Nếu là `figma` (Design file, không phải board),
  nói rõ — mọi thứ vẫn vẽ được nhưng bản Design đẹp hơn và có thêm
  `sequence`.
- Nhiều cửa sổ Figma đang mở → `channels` có nhiều mục. Truyền `file` trong
  lời gọi, **không** bảo người dùng đi bấm Connect.

## Bước 1 — Dịch yêu cầu sang loại diagram

Người dùng nói bằng ngôn ngữ nghiệp vụ, không nói `type:`. Bảng này là của
bạn, không phải của họ.

| Họ nói | `type` | Dấu hiệu nhận ra |
|---|---|---|
| luồng màn hình, user đi qua những màn nào | `userflow` | có màn hình, có rẽ nhánh |
| quy trình, ai làm bước nào, bàn giao giữa bộ phận | `activity` | có **người/bộ phận** khác nhau |
| vòng đời, trạng thái, đơn hàng chuyển từ … sang … | `state` | một thực thể, nhiều giá trị |
| dữ liệu, bảng, quan hệ | `erd` | danh từ + khoá + quan hệ |
| sản phẩm gồm những trang nào, cây menu | `sitemap` | chứa-đựng, không phải điều hướng |
| hệ thống làm được gì, cho ai, phạm vi | `usecase` | tranh luận về **phạm vi** |
| trải nghiệm, cảm xúc, điểm đau | `journey` | có "lúc đó họ thấy thế nào" |
| chân dung người dùng | `persona` | mục tiêu + khó khăn của một người |
| **user story map** | `sitemap` 3 cấp | activity → task → story. Nói rõ đang ánh xạ như vậy |
| tuần tự theo thời gian, API gọi nhau | — | **FigJam không vẽ được**, xem bước 5 |

Không chắc giữa hai loại → hỏi bằng `AskUserQuestion`, một câu, kèm ví dụ
cụ thể của họ. Đừng vẽ cả hai.

## Bước 2 — "theo template" nghĩa là gì

Nếu yêu cầu có chữ *template*, *theo mẫu*, *giống cái đang có*:

```
mcp__reqwise-figma__figma_read { op: "get_page_model" }
```

Rồi đọc board bằng `figma_read` `get_design_context` ở vùng người dùng chỉ.
Học **ba thứ, và chỉ ba thứ**:

1. **Quy ước đặt tên** — `FLOW C01 · Trả lời tin nhắn`, `TAG START — …`.
   Đặt tên frame/section theo đúng khuôn đó.
2. **Từ vựng nhãn** — họ viết "Thread mở ra" hay "Mở thread"? Dùng giọng
   của họ.
3. **Mức chi tiết** — một bước là một câu hay một đoạn?

**Không** cố sao chép hình dạng, màu hay bố cục của template. Layout do tool
tính; ép nó giống một bản vẽ tay sẽ hỏng cả hai. Nếu người dùng thật sự cần
đúng hình dạng đó, nói thẳng là công cụ không làm được và hỏi xem quy ước
tên + từ vựng đã đủ chưa.

## Bước 3 — Dựng model, hỏi phần thiếu

Viết bằng **compact `text` form** — rẻ hơn khoảng ba lần so với mảng JSON.
Cú pháp từng loại: `figma_docs({ section: "<kind>" })`.

Nguyên tắc không thoả hiệp:

- **Không bịa.** Thiếu thì hỏi, hoặc để trống cho checker báo. Một stage
  không có touchpoint là **phát hiện**, không phải lỗi cần lấp.
- **Dùng chữ của người dùng** cho nhãn. `contacts-list` là `id`; "Danh sách
  liên hệ" là nhãn.
- Nguồn là file (`@spec.md`) → đọc trước, chỉ hỏi những chỗ file không nói.

## Bước 4 — Kiểm rồi vẽ, trong một lời gọi

```
mcp__reqwise-figma__figma_diagram {
  type: "<kind>", title: "...", text: "...",
  options: { checkFirst: true }
}
```

`checkFirst: true` → kiểm model trước, **chỉ vẽ khi không có phát hiện**.
Có phát hiện thì không vẽ gì và trả về danh sách.

Đọc **mọi** warning. Chúng nói về **model**, không phải bản vẽ — đó là giá
trị chính của công cụ này, không phải cái hình. Ví dụ: "2 stage không có
touchpoint", "use case này không ai khởi động được", "hai persona muốn 80%
những thứ giống nhau".

Với mỗi phát hiện: hoặc sửa model cùng người dùng, hoặc ghi nhận đó là điều
có chủ đích. **Đừng im lặng vẽ đè.**

Vẽ lại một diagram đã có: `update: "<sectionId>"` + `patch` — section giữ
nguyên id nên comment và vị trí người dùng đã kéo đều còn.

## Bước 5 — Những gì board không làm được

Nói ngay khi gặp, đừng để người dùng phát hiện sau:

- **`sequence`** — trục dọc là thời gian, mà connector FigJam bám vào node
  chứ không bám điểm trên lifeline. Mọi message giữa cùng một cặp sẽ chồng
  lên một đường và thứ tự biến mất. Dùng Design file, hoặc `activity` nếu
  chỉ cần biết ai làm gì.
- **Component, variable, design system, prototype, a11y/responsive audit** —
  không tồn tại trên board. Tool sẽ từ chối kèm lý do; chuyển sang Design
  file.
- **Hộp nhiều ngăn** — entry/do/exit của state, danh sách cột của ERD,
  các mục của persona thành dòng chữ trong shape, vì board không có
  auto-layout.

## Bước 6 — Báo cáo

Ba phần, ngắn:

1. Đã vẽ gì, ở đâu (`frameId`, tên section).
2. **Phát hiện của checker**, và với mỗi cái: đã sửa, hay cố ý để vậy.
3. Điều chỉ bạn biết: chỗ nào lấy từ nguồn, chỗ nào từ câu trả lời của
   người dùng, chỗ nào vẫn là giả định.

Đừng kết thúc bằng "đã vẽ xong". Kết thúc bằng điều bản vẽ vừa cho thấy.
