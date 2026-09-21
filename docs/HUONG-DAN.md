# Hướng dẫn cài đặt

Dành cho người **cài công cụ này cho nhóm**. Làm một lần.

Nếu bạn chỉ muốn *dùng*, đọc [README](../README.md) — ở đó không có dòng
lệnh nào.

---

## Hiểu một phút, đỡ mò một giờ

Có ba mảnh, và mảnh ở giữa là thứ hay bị quên:

```
Claude  ←→  một chương trình nhỏ chạy nền  ←→  plugin trong Figma  →  canvas
```

- **Plugin phải đang chạy.** Nó là cây cầu. Đóng cửa sổ plugin là sập cầu.
- **Mọi thứ chạy trên máy người dùng.** Không có gì gửi lên máy chủ Figma,
  nên không đụng hạn mức của Figma MCP bản chính thức.
- **Phải có quyền sửa file.** Figma chỉ cho chạy plugin trên file bạn được
  sửa, kể cả plugin chỉ đọc. Quyền chỉ-xem là **không chạy được gì**, chứ
  không phải chạy hạn chế.

Chọn một trong hai đường:

| | Ai dùng | Cần gì trên máy họ |
|---|---|---|
| **Cowork** | Người không rành kỹ thuật | Không gì cả |
| **Claude Code** | Người làm kỹ thuật | Cài repo này |

---

## Đường 1 — Cowork (khuyên dùng cho số đông)

Người dùng cuối **không phải cài gì**. Họ chỉ cần Figma và một lần chép-dán.

Việc của bạn là đưa plugin đến tay họ. Hai cách:

**Nhanh, cho vài người:** gửi họ thư mục `plugin/`, hướng dẫn *Plugins →
Development → Import plugin from manifest…*. Chạy được, nhưng mỗi người
phải tự làm và nhiều người sẽ vướng.

**Đúng, cho cả công ty:** publish plugin. Đây mới là thứ gỡ rào cản thật.

- Có gói **Organization/Enterprise** → publish riêng cho tổ chức. Không qua
  kiểm duyệt, không lộ ra ngoài.
- Không có → publish công khai lên Figma Community. Mất vài ngày kiểm
  duyệt, sau đó ai cũng cài bằng một cú bấm.

Relay đã dựng sẵn và người dùng không cần biết nó tồn tại. Chi tiết cùng ba
mức bảo mật: [COWORK.md](./COWORK.md).

---

## Đường 2 — Claude Code

### Cài

```bash
git clone <repo> figma-mcp-pro
cd figma-mcp-pro
npm install
npm run build
npm run install:figjam
```

Dòng cuối làm hai việc: đăng ký công cụ ở mức tài khoản (chạy được từ mọi
thư mục) và cài sáu câu lệnh tắt.

**Khởi động lại Claude Code.** Nó chỉ nạp công cụ lúc khởi động.

Kiểm tra:

```bash
claude mcp list
# reqwise-figma: … - ✔ Connected
```

Chạy lại `npm run install:figjam` mỗi khi **chuyển repo sang chỗ khác** hoặc
**sửa câu lệnh tắt**.

### Cài plugin vào Figma

Phải là **Figma bản cài trên máy**, không phải trong trình duyệt.

1. Menu **Plugins → Development → Import plugin from manifest…**
2. Chọn `plugin/manifest.json` trong repo
3. Mở file bạn **có quyền sửa**
4. **Plugins → Development → Reqwise Figma MCP**
5. **Để cửa sổ plugin mở**

Bước 4–5 làm lại mỗi lần mở Figma.

---

## Đường 3 — Claude Desktop

Chạy được, nhưng **không có câu lệnh tắt** — người dùng phải tự mô tả việc
cần làm.

Mở file cấu hình:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Thêm vào:

```json
{
  "mcpServers": {
    "reqwise-figma": {
      "command": "node",
      "args": ["C:/đường/dẫn/đầy/đủ/figma-mcp-pro/dist/server/index.js"]
    }
  }
}
```

Đường dẫn phải **đầy đủ từ gốc ổ đĩa**. Khởi động lại Claude Desktop.

---

## Sáu câu lệnh tắt (chỉ Claude Code)

Chia theo **câu hỏi người dùng đang có**, không theo tên loại sơ đồ — họ
không biết mình cần `activity` hay `state`, họ biết mình cần vẽ một quy
trình.

| Lệnh | Khi nào |
|---|---|
| `/figjam-flow` | luồng màn hình, quy trình, vòng đời trạng thái |
| `/figjam-scope` | phạm vi hệ thống, cây trang, story map |
| `/figjam-user` | persona, hành trình, điểm khó chịu |
| `/figjam-data` | sơ đồ dữ liệu |
| `/figjam-check` | **chỉ soát, không vẽ** |
| `/figjam-pro` | chưa rõ cần gì |

Ngoài ra còn chín hướng dẫn `/figma-*` chi tiết cho từng loại, dùng khi đã
biết chính xác mình cần gì.

### "theo template" nghĩa là gì

Người dùng thêm chữ *theo template* thì công cụ đọc board và học **ba thứ**:
cách đặt tên, cách dùng từ của nhóm, và mức chi tiết.

Nó **không** sao chép hình dạng, màu hay bố cục — bố cục do công cụ tự tính,
ép cho giống bản vẽ tay sẽ hỏng cả hai. Nói trước để người dùng không kỳ
vọng nhầm.

---

## Board và file thiết kế khác nhau chỗ nào

| | Board (FigJam) | File thiết kế |
|---|---|---|
| 8 loại sơ đồ | ✅ | ✅ |
| Sơ đồ trao đổi theo thời gian | ❌ | ✅ |
| Đường nối | Kéo hộp là đường tự đi theo | Đường vẽ, có bộ tính lại |
| Hộp nhiều ngăn | Gộp thành dòng chữ | Đầy đủ |
| Component, biến, design system | ❌ | ✅ |
| Kiểm tra tiếp cận / co giãn | ❌ | ✅ |

Sơ đồ trao đổi theo thời gian bị chặn trên board **có lý do**, không phải
thiếu tính năng: trục dọc của nó là **thời gian**, mà đường nối trên board
bám vào cả cái hộp chứ không bám một điểm trên trục — mọi tin nhắn giữa cùng
hai bên sẽ chồng lên một đường và **thứ tự biến mất**. Nó vẫn trông giống
một sơ đồ đúng, và đó là điều tệ hơn báo lỗi.

---

## Hỏng thì xem đây

| Chuyện xảy ra | Nguyên nhân |
|---|---|
| Báo không có plugin nào kết nối | Cửa sổ plugin đã đóng, hoặc chưa chạy plugin sau khi mở Figma |
| Claude không thấy công cụ | Chưa khởi động lại Claude Code sau khi cài |
| Không import được plugin | Đang dùng Figma trong trình duyệt — phải dùng bản cài máy |
| Chạy plugin không lên gì | File chỉ có quyền xem. Duplicate sang bản của mình |
| Báo thao tác cần file thiết kế | Đang ở board mà việc đó chỉ làm được ở file thiết kế |
| Vẽ nhầm cửa sổ Figma | Nhiều cửa sổ đang mở — bảo Claude tên file cụ thể |
| **Sửa code rồi mà không thấy gì đổi** | Phải đủ ba bước: `npm run build` → khởi động lại Claude Code → chạy lại plugin. Thiếu bước nào cũng ra **cùng một triệu chứng**, nên rất dễ đi tìm sai chỗ |
| Báo `Connection closed` lúc khởi động | Còn tiến trình cũ đang giữ cổng. Tắt nó đi |

Cách chẩn đoán nhanh nhất: bảo Claude *"kiểm tra kết nối"*. Nó trả về danh
sách việc cần làm, không phải một chữ được/không được.

---

## Nó không làm được gì

- Không chạy nếu chỉ có quyền xem file
- Không chạy ngầm, không chạy trong CI — phải mở Figma trên máy
- Không đọc được file chưa mở
- Không có Code Connect chính thức
- Không sao chép hình dạng từ template, chỉ học cách đặt tên và từ vựng
- Story map hiện vẽ dưới dạng cây ba cấp, chưa phải lưới ngang đúng chuẩn
- **Không biết model của bạn có đúng không** — chỉ biết nó có mạch lạc
  không. Một sơ đồ hoàn hảo về một sản phẩm sai vẫn qua hết mọi kiểm tra.
