---
description: Vẽ phía người dùng lên FigJam — chân dung (persona) hoặc hành trình và cảm xúc (journey)
argument-hint: "<ai, hoặc trải nghiệm nào> [@file nghiên cứu]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs
---

# /figjam-user — $ARGUMENTS

| Câu hỏi | `type` |
|---|---|
| Xây cho ai, họ muốn gì, cái gì cản họ? | `persona` |
| Trải nghiệm diễn ra thế nào, đau ở đâu? | `journey` |

Hai cái đi thành cặp: `journey` nhận `persona: "<id>"` để nối vào nhau. Nếu
board đã có `Persona · ` frame thì dùng lại đúng id đó.

## Luật tuyệt đối cho `persona`

- **Không bao giờ bịa `quote`.** Câu trích được vẽ to và ai nhìn tường cũng
  đọc nó như bằng chứng. Không có câu nguyên văn từ nghiên cứu thì **bỏ
  trống**. Một câu diễn giải trông y hệt câu thật — đó chính là lý do luật
  này tuyệt đối chứ không phải một lời khuyên.
- **Không sinh ảnh chân dung.** Avatar là chữ cái đầu trên nền màu. Ảnh
  stock làm persona *có vẻ* đã nghiên cứu trong khi chưa.
- `goals` và `frustrations` là phần chịu lực. Tuổi, thành phố là
  `demographics` — vẽ cuối và nhỏ nhất, và một thẻ chỉ có chúng sẽ bị báo.
- **Một** primary. Hai primary là sản phẩm không vừa với ai.
- Điền `role: "negative"` — ai **không** phải người dùng của bản này. Đó là
  ô không ai điền, và là ô giữ backlog khỏi trôi về phía người nói to nhất.

## Luật tuyệt đối cho `journey`

- Một stage là **giai đoạn của ý định**, không phải màn hình. "Hỏi đồng
  nghiệp xem có đáng làm không" là một stage — nó không có màn hình nào và
  nó thuộc về bản đồ. Mô hình hoá stage thành màn hình là bạn vừa vẽ lại
  userflow, dở hơn.
- Stage **không có touchpoint là phát hiện**, không phải lỗi. Đừng bịa ra
  một touchpoint cho hàng đỡ trống.
- `feeling` là −2..2, số nguyên. Nghiên cứu cho ra "bực" và "nhẹ nhõm",
  không cho ra 7.4.
- **Đừng vẽ đường cong cho đẹp.** Tụt ở giữa rồi hồi phục là hình ai cũng vẽ
  và gần như không ai đo. Nghiên cứu nói xấu tới cuối thì vẽ xấu tới cuối.

Trên board, mỗi stage mở đầu bằng một emoji cảm xúc — vì lưới bị gập vào
từng cột, và hàng emoji là thứ còn quét được để tìm điểm thấp.

## Checker sẽ bắt gì

Thẻ không có mục tiêu lẫn khó khăn · thẻ toàn nhân khẩu học mà không có hành
vi quan sát được · hai persona muốn ~cùng một thứ (là **một người hai chức
danh**, và sản phẩm sẽ có hai backlog cho một nhu cầu) · không có primary,
hoặc có hai · quá năm persona.

Journey: stage không ai phục vụ · có điểm đau mà không có cơ hội nào ·
đường cảm xúc phẳng lì suốt bốn stage trở lên (dấu hiệu cột đó được *điền*
chứ không được *nghiên cứu*) · không có stage nào âm.

## Trước khi vẽ

```
mcp__reqwise-figma__figma_status
```

`pluginConnected: false` → dừng. Bảo người dùng mở Figma Desktop, chạy plugin
**Reqwise Figma MCP**, giữ cửa sổ plugin mở.

## Bắt buộc khi báo cáo

Nói rõ **chỗ nào từ nghiên cứu, chỗ nào từ giả định**. Một bộ persona được
đọc như bằng chứng trong khi một nửa là phỏng đoán thì gây hại hơn là không
có gì. Và nếu không có persona `negative` nào trên tường, nói ra — một ô
trống ở đó tự nó đã là phát hiện.
