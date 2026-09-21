---
description: Soát model trên FigJam board — không vẽ gì, chỉ tìm lỗ hổng và chỗ các bản vẽ mâu thuẫn nhau
argument-hint: "[phạm vi cần soát]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs
---

# /figjam-check — $ARGUMENTS

**Không vẽ gì.** Lệnh này chỉ đọc và soát. Dùng khi board đã có sẵn bản vẽ và
câu hỏi là "chỗ nào sai", không phải "vẽ thêm".

## Bước 1 — Đọc mọi model trên trang

```
mcp__reqwise-figma__figma_read { op: "get_page_model" }
```

Mỗi frame do công cụ này vẽ đều **nhớ model đã tạo ra nó**. Đó là thứ cho
phép hỏi một câu mà không checker đơn lẻ nào trả lời được: **các bản vẽ có
mâu thuẫn nhau không?**

Frame vẽ từ trước khi model được lưu sẽ trả về `stale`/`unreadable` — nêu ra,
đừng bỏ qua. Cách sửa là vẽ lại đúng một lần bằng `update: "<frameId>"`, sau
đó nó tham gia được vào phần soát chéo.

## Bước 2 — Soát chéo, phần đáng giá nhất

Mỗi checker chỉ đọc **một** model. Lỗi không ai thấy là hai bản vẽ **đều
đúng** mà **nói khác nhau**:

- sequence retry ba lần, state machine chặn ở `n < 5`;
- ERD lưu được trạng thái `cancelled`, vòng đời không có đường nào tới đó;
- userflow đi qua một màn mà sitemap không có trang tương ứng;
- một màn mang hai id khác nhau ở hai bản vẽ — cả hai trông đều đúng và
  không có gì phía sau biết đó là một màn.

Loại lỗi này không tự lộ ra. Nó lộ ra lúc ai đó code theo bản vẽ này còn
người kia test theo bản vẽ kia.

## Bước 3 — Chạy lại từng checker mà không vẽ

Với mỗi diagram đáng ngờ, lấy model ra rồi chạy lại ở chế độ khô:

```
mcp__reqwise-figma__figma_read { op: "get_diagram_spec", params: { nodeId: "<frameId>" } }
mcp__reqwise-figma__figma_diagram { type: "<kind>", ...spec, options: { dryRun: true } }
```

`dryRun` **không chạm tới canvas** — chỉ kiểm và trả về phát hiện. An toàn
tuyệt đối để chạy trên board của người khác.

## Bước 4 — Đối chiếu với thiết kế, nếu có

`get_page_model` của sitemap còn trả về `coverage`: trang nào chưa có
artboard, artboard nào không thuộc trang nào. Một artboard "mồ côi" chín
trên mười lần là **một trạng thái** của trang đã có (màn rỗng, màn lỗi) —
cách sửa là thêm nó vào `screen:` của trang đó, không phải đẻ ra trang mới.

## Bước 5 — Báo cáo, xếp theo giá phải trả

Không xếp theo thứ tự tìm thấy:

1. **Mâu thuẫn giữa các bản vẽ** — đắt nhất, vì từng bản vẽ riêng đều đúng
   nên không ai đi tìm.
2. **Lỗ hổng model** — use case không ai khởi động được, stage không ai phục
   vụ, bảng không có khoá chính.
3. **Trôi dạt** — frame cũ chưa lưu model, id đặt không khớp nhau.

Với mỗi mục: nói **cần ai quyết định gì**, đừng chỉ nói cái gì sai. Và
**đừng sửa model của người khác mà không hỏi** — trên một board chung, im
lặng sửa còn tệ hơn để nguyên lỗi.

## Trước khi bắt đầu

```
mcp__reqwise-figma__figma_status
```

`pluginConnected: false` → dừng. Bảo người dùng mở Figma Desktop, chạy plugin
**Reqwise Figma MCP**, giữ cửa sổ plugin mở.
