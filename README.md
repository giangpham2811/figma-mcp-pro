# figma-mcp-pro

**Cho AI agent đọc và vẽ lên canvas Figma — FigJam board hoặc Design file.**
Bạn nói bằng tiếng Việt, nó chọn loại diagram, **soát model trước khi vẽ**,
rồi vẽ và báo lại những gì soát ra.

Thứ đáng giá không phải cái hình. Là những câu nó hỏi ngược lại bạn:

> *Use case `xuat_bao_cao` không có actor nào và không gì include nó, nên
> không ai khởi động được. Hoặc nó ngoài phạm vi, hoặc thiếu một actor.*
>
> *2 giai đoạn không có điểm chạm: `can`, `nhap`. Hoặc người dùng tự xoay xở
> ở đó — đáng nói ra cho rõ — hoặc sản phẩm có lỗ hổng đúng chỗ họ cần.*

Đó là những điều một bản vẽ tay không bao giờ nói với bạn.

---

## Bắt đầu

### Claude Cowork — hai bước, không cài gì

1. **Figma Desktop** → chạy plugin → khối *Claude Cowork* đã có sẵn đường
   dẫn → bấm **Chép**
2. **Cowork** → Settings → Connectors → **Add custom connector** → dán vào
   ô *MCP server URL*

### Claude Code — có 6 slash command

```bash
npm install && npm run build
npm run install:figjam     # đăng ký MCP user scope + cài slash command
```

Khởi động lại Claude Code. Trong Figma **Desktop**: Plugins → Development →
Import plugin from manifest… → `plugin/manifest.json`, chạy plugin và **giữ
cửa sổ plugin mở** — nó là cây cầu.

> File phải là file bạn **có quyền sửa**. Figma không cho chạy plugin trên
> file chỉ-xem, kể cả plugin thuần đọc. File người khác chia sẻ chỉ-xem:
> *Duplicate to your drafts* rồi làm trên bản của bạn.

### Hướng dẫn đầy đủ

- **[docs/HUONG-DAN.md](docs/HUONG-DAN.md)** — cài đặt, Claude Code, Claude Desktop, khắc phục sự cố
- **[docs/COWORK.md](docs/COWORK.md)** — Cowork, relay, ba mức bảo mật
- **[docs/TOOLS.md](docs/TOOLS.md)** — tham chiếu đầy đủ mọi tool và tham số
- **[docs/FIGMA-MCP-VS-PLUGIN-BRIDGE.md](docs/FIGMA-MCP-VS-PLUGIN-BRIDGE.md)** — vì sao không dùng Figma MCP chính thức

---

## Sáu slash command

Chia theo **câu hỏi bạn đang có**, không theo loại diagram — bạn không biết
mình cần `activity` hay `state`, bạn biết mình cần vẽ một quy trình.

| Command | Dùng khi |
|---|---|
| `/figjam-flow` | luồng màn hình, quy trình, vòng đời trạng thái |
| `/figjam-scope` | phạm vi hệ thống, cây trang, story map |
| `/figjam-user` | persona, journey, điểm đau |
| `/figjam-data` | ERD — bảng, khoá, quan hệ |
| `/figjam-check` | **soát, không vẽ** — tìm chỗ các bản vẽ mâu thuẫn nhau |
| `/figjam-pro` | chưa biết mình cần gì |

```
/figjam-flow vẽ luồng đăng nhập, có cả trường hợp sai mật khẩu
/figjam-scope vẽ use case cho app này theo template trên board
/figjam-check soát xem các bản vẽ trên trang có mâu thuẫn nhau không
```

`/figjam-check` thường là cái đáng chạy nhất trên board đã có sẵn nhiều bản
vẽ: mỗi frame **nhớ model đã tạo ra nó**, nên nó hỏi được câu mà không
checker đơn lẻ nào trả lời — *sequence retry ba lần trong khi state machine
chặn ở `n < 5`*.

---

## Sáu tool

| Tool | Làm gì |
|---|---|
| `figma_status` | Chẩn đoán. Trả về `hints` là danh sách việc cần làm, không phải một chữ true/false. Gọi đầu tiên. |
| `figma_read` | Đọc canvas, trả lời đã nén và lọc: `layout_audit` chỉ trả node **có vấn đề**, `screenshot` là image block thật chứ không phải base64 nhét trong text. |
| `figma_write` | Chạy JavaScript trong sandbox `vm` với proxy `figma.*`. `batch` gộp 200 thao tác vào một vòng. 96 op: vẽ, component, variant, token, design system, audit, demo. |
| `figma_diagram` | Vẽ **nine** diagram kinds từ model **bạn** suy ra, mỗi loại kèm phát hiện về *nội dung* chứ không phải về bản vẽ. `activity` quy trình có swimlane · `sequence` trao đổi theo thời gian · `state` vòng đời một thực thể · `erd` mô hình dữ liệu · `userflow` màn hình người dùng đi qua · `sitemap` sản phẩm gồm những trang nào · `usecase` hệ thống làm gì cho ai · `journey` trải nghiệm và cảm xúc · `persona` chân dung người dùng. Viết bằng compact `text` form rẻ hơn ~ba lần, vẽ cả bộ trong một lời gọi, và **sửa** bằng `update` + `patch` thay vì vẽ lại từ đầu. |
| `figma_rules` | Một lời gọi ra bảng luật design system: styles + variables + components, dạng markdown. Đọc trước khi vẽ để tái dùng token thay vì hardcode. |
| `figma_docs` | Tài liệu theo yêu cầu: `rules` \| `layout` \| `api` \| `tokens` \| `icons` \| `recipes` \| `style` \| `userflow` \| `activity` \| `erd` \| `sequence` \| `sitemap` \| `state` \| `persona` \| `journey` \| `usecase`. |

---

## FigJam và Design khác nhau chỗ nào

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

---

## Kiến trúc

```
Claude Code   ──stdio──►  MCP server (máy bạn)        ──WS──►  Plugin  ──►  Figma
Claude Cowork ──HTTPS──►  Worker + Durable Object    ◄──WS──   Plugin  ──►  Figma
```

Plugin là WebSocket **client** nên nó gọi ra ngoài — đó là thứ khiến cả hai
đường dùng chung một plugin. Cowork chạy trên đám mây, không thấy máy bạn,
nên hai bên gặp nhau ở một relay công khai thay vì ở `localhost`.

Mọi thứ đi qua **Figma Plugin API** (miễn phí, chạy trong app), không qua
Figma MCP chính thức (bán theo seat, có hạn mức). Đo thật: đọc một board sản
phẩm qua Figma MCP trả về **632.022 ký tự**; vẽ một diagram qua đường này tốn
**~1,3 KB vào / ~250 B ra**. Chênh lệch không đến từ nén giỏi hơn — kết quả
của việc vẽ là *bức tranh trên canvas*, không phải mô tả bức tranh trong
context.

---

## Dự án này là gì

Fork của **[reqwise-figma-mcp](https://github.com/hoangpm96/reqwise-figma-mcp)**
(Hoang Phan, MIT) — bridge, plugin, sáu diagram gốc và toàn bộ lớp
safe-drawing là của họ. Xem [`LICENSE`](LICENSE) và [`NOTICE`](NOTICE).

Upstream bán lớp authoring thành một sản phẩm thương mại riêng. Fork này tự
viết lại lớp đó dựa trên Figma Plugin API công khai, từ danh sách tính năng
đã công bố. Không dùng dòng code thương mại nào của upstream.

Đã bổ sung: component authoring (18 op), design system generator (10 visual
style × 60 component), `a11y_audit`, `responsive_audit`, self-playing demo,
ba diagram kind `usecase` / `journey` / `persona`, `loadAvatar`, hỗ trợ
FigJam, và relay cho Cowork. `src/shared/editions.ts` là backlog và hiện đã
rỗng.

---

## Phát triển

```bash
npm run build       # server → dist/, plugin → plugin/code.js
npm run typecheck
npm test            # ~1545 test
npm run verify      # typecheck + test
```

Sửa code rồi **phải làm đủ ba bước**: `npm run build` → khởi động lại Claude
Code → chạy lại plugin trong Figma. Hai nửa cũ đi lệch nhau độc lập, và
thiếu bước nào cũng ra cùng một triệu chứng: *"sửa rồi mà không thấy gì
đổi"*.

Đọc [`ARCHITECTURE.md`](ARCHITECTURE.md) trước khi sửa phần bridge hay
diagram — nó ghi lại những lỗi đã phải trả giá mới tìm ra.
