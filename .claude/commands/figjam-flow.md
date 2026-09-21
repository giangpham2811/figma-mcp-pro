---
description: Vẽ luồng lên FigJam — màn hình người dùng đi qua, quy trình ai làm bước nào, hoặc vòng đời một trạng thái
argument-hint: "<luồng cần vẽ> [@file nguồn]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs
---

# /figjam-flow — $ARGUMENTS

Ba loại luồng, và chọn sai là hỏng cả bản vẽ. Phân biệt bằng **câu hỏi mà
bản vẽ trả lời**, không bằng hình dáng:

| Câu hỏi | `type` | Dấu hiệu |
|---|---|---|
| Người dùng thấy màn nào tiếp theo? | `userflow` | có màn hình, có rẽ nhánh, có ngõ cụt |
| Ai làm bước nào, bàn giao ở đâu? | `activity` | có **nhiều người/bộ phận** — đó là swimlane |
| Một thứ chuyển qua những trạng thái nào? | `state` | **một** thực thể, nhiều giá trị nó mang |

Nhầm hay gặp nhất: vẽ `state` khi thật ra là `activity`. Nếu các hộp là
*việc phải làm* thì là activity; nếu là *giá trị hệ thống đang lưu* thì là
state.

Không chắc → hỏi một câu bằng `AskUserQuestion`, kèm ví dụ cụ thể của họ.

## Đặc thù khi vẽ trên board

- `activity`: FigJam **không có swimlane**. Chủ sở hữu bước được ghi thành
  dòng `— Tên bộ phận` trong chính hộp đó. Nói trước để người dùng không đi
  tìm dải màu.
- `state`: `entry/do/exit` thành dòng chữ trong hộp, vì board không có ngăn.
- `userflow`: hộp quyết định là hình thoi — đó là cách người đọc biết phải
  tìm hai lối ra.

## Checker sẽ bắt gì

Câu hỏi chỉ có một lối ra · ngõ cụt · màn không ai tới được · bàn giao không
nhãn · bước không ai làm · nhánh rẽ không bao giờ nhập lại · trạng thái
không thể tới · trạng thái không thể thoát · hai chuyển tiếp tranh nhau trên
cùng một sự kiện.

Đó là phát hiện về **model**, không phải về hình. Chúng mới là thứ đáng giá.

## Trước khi vẽ

```
mcp__reqwise-figma__figma_status
```

`pluginConnected: false` → dừng. Bảo người dùng mở Figma Desktop, chạy plugin
**Reqwise Figma MCP**, giữ cửa sổ plugin mở. Đừng đoán, đừng thử vẽ.

Nhiều cửa sổ Figma → `channels` nhiều mục → truyền `file` trong lời gọi,
đừng bảo người dùng đi bấm Connect.

## Ba luật không thoả hiệp

1. **Không bịa.** Nguồn không nói thì hỏi, hoặc để trống cho checker báo.
   Một ô trống là **phát hiện**, không phải lỗi cần lấp.
2. **Dùng chữ của người dùng** cho nhãn. `contacts-list` là `id`;
   "Danh sách liên hệ" là nhãn.
3. **`options: { checkFirst: true }`** — kiểm model trước, chỉ vẽ khi sạch.
   Có phát hiện thì không vẽ gì. Đọc hết warning, với mỗi cái: sửa cùng
   người dùng, hoặc ghi nhận là có chủ đích. Đừng im lặng vẽ đè.

Cú pháp compact `text` của từng loại: `figma_docs({ section: "<kind>" })`.
Rẻ hơn khoảng ba lần so với mảng JSON.

## Báo cáo

Đã vẽ gì và ở đâu · checker tìm thấy gì và bạn xử lý ra sao · chỗ nào là giả
định của bạn chứ không phải của nguồn. Kết thúc bằng điều bản vẽ cho thấy,
không phải bằng "đã vẽ xong".
