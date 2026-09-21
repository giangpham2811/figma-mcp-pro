---
description: Vẽ phạm vi lên FigJam — hệ thống làm được gì cho ai (use case), hoặc sản phẩm gồm những trang nào (sitemap)
argument-hint: "<hệ thống hoặc sản phẩm> [@file nguồn]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs
---

# /figjam-scope — $ARGUMENTS

Hai bản vẽ trả lời hai câu hỏi phạm vi khác nhau:

| Câu hỏi | `type` |
|---|---|
| Hệ thống làm được gì, cho ai, cái gì nằm ngoài? | `usecase` |
| Sản phẩm gồm những trang nào, trang nào chứa trang nào? | `sitemap` |

## `usecase` — ranh giới mới là thứ đáng tranh luận

- Một use case là **mục tiêu**, không phải bước. "Chia tiền bữa ăn" đúng;
  "Màn hình chia tiền" là màn hình, "Bấm nút Lưu" là thao tác.
- **Không có thứ tự.** Muốn thứ tự thì dùng `/figjam-flow`.
- `extends` viết trên **cái mở rộng**, trỏ về cái gốc — gốc không biết phần
  mở rộng tồn tại. Đây là lỗi phổ biến nhất khi vẽ tay, và công cụ vẽ đúng
  những gì bạn viết chứ không tự sửa hộ.
- `includes` nghĩa là **luôn luôn**. Thỉnh thoảng thì là `extends`.
- Actor là **vai trò**, không phải người. "Người chia tiền", không phải
  "Lan" — Lan thuộc về `/figjam-user`.
- Trên board, chính SECTION là đường ranh giới hệ thống.

Phần quan trọng nhất của buổi vẽ là **thứ bạn cố ý để ngoài ranh giới**. Hỏi
cho ra, và đọc to danh sách đó khi báo cáo — không ai viết nó xuống và ai
cũng ngầm hiểu khác nhau.

## `sitemap` — chứa đựng, không phải điều hướng

`parent` nghĩa là "trang này **nằm trong** trang kia", không phải "đi từ đó
sang". Không có mảng `edges` và đường kẻ không có đầu mũi tên. Muốn mũi tên
thì bạn đang cần `/figjam-flow`.

- Một trang xuất hiện **một lần**. Tới được từ hai chỗ là điều hướng.
- `section` chỉ dành cho tiêu đề menu **không có trang phía sau**.
- Tab thường **không** phải một cấp. Nếu bấm tab mà nav không đổi highlight
  thì đó là nội dung của một trang.
- **User story map** ánh xạ vào đây: ba cấp activity → task → story. Nói rõ
  với người dùng là đang ánh xạ như vậy, vì hình ra sẽ là cây dọc chứ không
  phải lưới ngang quen thuộc. Nếu họ cần đúng hình lưới, nói thẳng là công
  cụ chưa có.

## Checker sẽ bắt gì

Use case không ai khởi động được · actor không làm gì · vòng lặp `include` ·
trang mồ côi · `section` chỉ có một con · cây sâu quá mức ai chịu bấm · và
đối chiếu với userflow đang có trên trang.

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
2. **Dùng chữ của người dùng** cho nhãn.
3. **`options: { checkFirst: true }`** — kiểm model trước, chỉ vẽ khi sạch.
   Đọc hết warning, với mỗi cái: sửa cùng người dùng, hoặc ghi nhận là có
   chủ đích. Đừng im lặng vẽ đè.

Cú pháp compact `text` của từng loại: `figma_docs({ section: "<kind>" })`.

## Báo cáo

Đã vẽ gì và ở đâu · checker tìm thấy gì và bạn xử lý ra sao · **danh sách
thứ để ngoài phạm vi** · chỗ nào là giả định của bạn.
