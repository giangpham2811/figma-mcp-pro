# Hướng dẫn dùng — từ cài đặt tới bản vẽ đầu tiên

Công cụ này cho AI agent **đọc và vẽ lên canvas Figma**: FigJam board hoặc
Figma Design file. Bạn nói bằng tiếng Việt, nó chọn loại diagram, **soát
model trước khi vẽ**, rồi vẽ và báo lại những gì soát ra.

Thứ đáng giá không phải cái hình. Là những câu nó hỏi ngược lại bạn — *use
case này không ai khởi động được*, *hai giai đoạn này không có điểm chạm
nào*, *hai persona này thật ra là một người*.

---

## 1. Kiến trúc — đọc một phút này để đỡ mất một giờ

```
Claude Code  ──stdio(MCP)──►  MCP server (Node)  ──WebSocket──►  Plugin  ──►  Figma Desktop
                                localhost:38470                 (chạy trong app)
```

Ba điều rút ra, và cả ba đều quan trọng:

- **Plugin phải đang chạy.** Nó là cây cầu. Đóng cửa sổ plugin là mất kết nối.
- **Mọi thứ chạy trên máy bạn.** Không có gì gửi lên server Figma, nên
  không dính hạn mức của Figma MCP chính thức.
- **Phải có quyền `can edit` trên file.** Figma chỉ cho người có quyền sửa
  chạy plugin, kể cả plugin chỉ đọc. Quyền `can view` là **không chạy được
  gì cả** — chi tiết ở [FIGMA-MCP-VS-PLUGIN-BRIDGE.md](./FIGMA-MCP-VS-PLUGIN-BRIDGE.md).
  File người khác chia sẻ chỉ-xem: *Duplicate to your drafts* rồi làm trên
  bản của bạn.

---

## 2. Cài đặt

```bash
git clone <repo> figma-mcp-pro
cd figma-mcp-pro
npm install
npm run build
```

### Đăng ký với Claude Code (khuyến nghị)

```bash
npm run install:figjam
```

Một lệnh đó làm hai việc: đăng ký MCP server ở **user scope** (chạy được từ
mọi thư mục, không chỉ trong repo này) và cài **6 slash command** vào
`~/.claude/commands/`.

**Khởi động lại Claude Code.** Tool MCP chỉ nạp lúc khởi động.

Kiểm tra:

```bash
claude mcp list
# reqwise-figma: node .../dist/server/index.js - ✔ Connected
```

Chạy lại lệnh trên mỗi khi bạn **di chuyển repo** hoặc **sửa slash command**.

<details>
<summary>Muốn tự đăng ký bằng tay</summary>

```bash
claude mcp add reqwise-figma -s user -- node /đường/dẫn/tuyệt/đối/dist/server/index.js
```

Dùng `node` + đường dẫn tuyệt đối. Đừng dùng `scripts/reqwise-mcp.sh` —
script đó gọi `pgrep`/`lsof`/`getconf` nên không chạy trên Windows.
</details>

### Cài plugin vào Figma

Bắt buộc phải là **Figma Desktop app**, không phải Figma trên trình duyệt.

1. Mở Figma Desktop
2. Menu **Plugins → Development → Import plugin from manifest…**
3. Chọn `plugin/manifest.json` trong repo
4. Mở file bạn **có quyền edit** (board hoặc Design file đều được)
5. **Plugins → Development → Reqwise Figma MCP**
6. **Giữ cửa sổ plugin mở**

Làm lại bước 5–6 mỗi lần mở Figma. Nếu bạn `npm run build` lại thì phải
chạy lại plugin *và* khởi động lại Claude Code — hai nửa cũ đi độc lập với
nhau và triệu chứng giống hệt nhau ("sửa rồi mà không thấy gì đổi").

---

## 3. Dùng với Claude Desktop

Claude Desktop hỗ trợ local MCP server, nhưng **không có slash command** —
bạn sẽ phải tự mô tả việc cần làm.

Sửa file cấu hình:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "reqwise-figma": {
      "command": "node",
      "args": ["C:/đường/dẫn/figma-mcp-pro/dist/server/index.js"]
    }
  }
}
```

Khởi động lại Claude Desktop. Đường dẫn phải **tuyệt đối**.

---

## 4. Claude Cowork — dùng được, qua relay

Cowork chạy trên đám mây nên không thấy `localhost` của bạn. Cách nối là
một **relay trên Cloudflare Workers**: plugin gọi ra, Cowork gọi vào, hai
bên gặp nhau ở đó. Có xác minh email công ty thật qua Cloudflare Access, và
nằm trong free tier.

**[→ docs/COWORK.md](./COWORK.md)** có đủ các bước.

Khác biệt cần biết: trên Cowork **không có** `figma_write`, design system,
và slash command — chỉ có 9 loại diagram cùng phần đọc/soát. Đó là phần
người non-tech cần, còn ai cần sandbox thì dùng Claude Code.

Riêng Figma trên **trình duyệt** thì vẫn không dùng được, vì *Import plugin
from manifest* chỉ có ở bản Desktop — trừ khi plugin đã được publish.

---

## 5. Sáu slash command

Command chuyên mục giúp bạn tập trung; `/figjam-pro` là cửa chung khi bạn
chưa biết mình cần gì.

| Command | Dùng khi | Vẽ ra |
|---|---|---|
| `/figjam-flow` | Luồng, quy trình, vòng đời | `userflow` · `activity` · `state` |
| `/figjam-scope` | Phạm vi, cây trang, story map | `usecase` · `sitemap` |
| `/figjam-user` | Chân dung, hành trình, cảm xúc | `persona` · `journey` |
| `/figjam-data` | Bảng, khoá, quan hệ | `erd` |
| `/figjam-check` | **Soát, không vẽ** | — |
| `/figjam-pro` | Không chắc cần gì | tất cả |

Ví dụ:

```
/figjam-flow vẽ luồng đăng nhập, có cả trường hợp sai mật khẩu và khoá tài khoản
/figjam-scope vẽ use case cho app này theo template trên board
/figjam-user vẽ journey người dùng chờ mã OTP @docs/spec.md
/figjam-data vẽ ERD phần đặt hàng từ schema.prisma
/figjam-check soát xem các bản vẽ trên trang có mâu thuẫn nhau không
/figjam-pro vẽ giúp tôi cái gì đó cho buổi họp spec chiều nay
```

`/figjam-check` thường là cái đáng chạy nhất trên một board đã có sẵn nhiều
bản vẽ: nó đọc lại model từng frame nhớ, rồi hỏi **các bản vẽ có mâu thuẫn
nhau không** — câu mà không checker đơn lẻ nào trả lời được.

Ngoài ra còn 9 skill `/figma-*` viết sâu cho từng loại, dùng khi bạn đã biết
chính xác mình cần gì.

### "theo template" nghĩa là gì

Thêm chữ *theo template* là agent sẽ đọc board và học **ba thứ**: quy ước
đặt tên (`FLOW C01 · …`), từ vựng nhãn (giọng của nhóm bạn), và mức chi tiết.

Nó **không** sao chép hình dạng, màu hay bố cục. Layout do công cụ tính; ép
nó giống một bản vẽ tay sẽ hỏng cả hai.

---

## 6. FigJam và Design khác nhau chỗ nào

| | FigJam board | Design file |
|---|---|---|
| 8 loại diagram | ✅ | ✅ |
| `sequence` | ❌ | ✅ |
| Đường nối | **Connector thật** — kéo hộp là đường tự đi theo | Vector + bộ định tuyến |
| Hộp nhiều ngăn | Thành dòng chữ | Đầy đủ |
| Component, variable, design system | ❌ | ✅ |
| a11y / responsive audit | ❌ | ✅ |

`sequence` bị chặn trên board **có lý do**, không phải thiếu tính năng: trục
dọc của nó là **thời gian**, mà connector FigJam bám vào node chứ không bám
điểm trên lifeline — mọi message giữa cùng một cặp sẽ chồng lên một đường và
thứ tự biến mất. Nó vẫn *trông giống* sequence diagram, và đó là điều tệ hơn
một lỗi.

Các op cần component/variable/prototype bị chặn kèm lý do cụ thể, không phải
báo lỗi chung chung.

---

## 7. Hỏng thì xem đây

| Triệu chứng | Nguyên nhân |
|---|---|
| `pluginConnected: false` | Cửa sổ plugin chưa mở, hoặc chưa chạy plugin sau khi mở Figma |
| Claude không thấy tool | Chưa khởi động lại Claude Code sau `install:figjam` |
| Plugin không import được | Đang dùng Figma trên trình duyệt — phải là Desktop app |
| Không chạy được plugin trong Figma | File chỉ có quyền `can view`. Duplicate sang drafts của bạn |
| `UNSUPPORTED_OPERATION` | Op cần Design file mà bạn đang ở board. Đọc `hint`, nó nói rõ thiếu gì |
| `AMBIGUOUS_CHANNEL` | Nhiều cửa sổ Figma đang mở. Truyền `file: "<tên file>"` |
| Sửa code rồi mà không đổi gì | `npm run build`, **rồi** khởi động lại Claude Code, **rồi** chạy lại plugin. Thiếu bước nào cũng ra triệu chứng y hệt |
| `Connection closed` khi khởi động | Còn tiến trình server cũ giữ cổng 38470. Tắt nó đi |

Luôn bắt đầu bằng `figma_status` — nó trả về `hints` là danh sách việc cần
làm, không phải một chữ true/false.

---

## 8. Nó không làm được gì

Nói trước để bạn không phát hiện lúc đang họp:

- **Không chạy nếu bạn chỉ có quyền xem file.**
- **Không chạy headless / CI.** Phải có Figma Desktop mở.
- **Không đọc được file không mở.** Figma MCP chính thức bản remote làm được
  điều này; kiến trúc plugin thì không.
- **Không có Code Connect chính thức.**
- **Không sao chép hình dạng từ template.** Chỉ học quy ước tên và từ vựng.
- **Chưa có story map đúng hình** — hiện ánh xạ sang `sitemap` ba cấp.
- **Checker không biết model của bạn có ĐÚNG không.** Nó biết model có
  *mạch lạc* không. Một use case diagram hoàn hảo về một sản phẩm sai thì
  vẫn qua hết mọi kiểm tra.
