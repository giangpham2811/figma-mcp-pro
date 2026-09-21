# Dùng với Claude Cowork

Cowork chạy trên đám mây của Anthropic: nó **không** spawn được tiến trình
trên máy bạn và **không** thấy `localhost` của bạn. Nên bản MCP chạy local
là vô hình với nó.

Cách đi vòng không phải là hack — nó dùng đúng cánh cửa Cowork mở sẵn:
**custom connector qua remote MCP**. Plugin Figma vốn đã là WebSocket
*client*, tức nó **gọi ra ngoài**. Cho cả hai bên gọi vào cùng một địa chỉ
công khai là chúng gặp nhau.

```
Cowork ──Streamable HTTP──► Worker ──► Durable Object ◄──WebSocket── Plugin ──► Figma
```

Người dùng cuối chỉ thấy: mở plugin → bấm một nút → đăng nhập bằng email
công ty → dán một đường dẫn vào Cowork. Xong.

---

## Phần dành cho người dựng (làm một lần)

### 1. Tạo KV namespace

```bash
cd relay
npx wrangler kv namespace create PAIRS
```

Chép `id` nó in ra vào `relay/wrangler.jsonc`, thay `REPLACE_WITH_YOUR_KV_ID`.

### 2. Khai domain công ty

Trong `relay/wrangler.jsonc`:

```jsonc
"vars": { "ALLOWED_EMAIL_DOMAINS": "congty.com" }
```

Nhiều domain thì ngăn bằng dấu phẩy. So khớp **chính xác**, không phải hậu
tố — nên `evil-congty.com` không lọt.

### 3. Deploy

```bash
npx wrangler deploy
```

Ghi lại địa chỉ, dạng `https://figjam-pro-relay.<tên-bạn>.workers.dev`.

### 4. Bật Cloudflare Access cho `/login`

Đây là bước **xác minh email thật**, và là bước duy nhất không thể bỏ nếu
bạn muốn giới hạn theo tên miền.

Cloudflare dashboard → **Zero Trust → Access → Applications → Add an
application → Self-hosted**:

| Ô | Giá trị |
|---|---|
| Application domain | `figjam-pro-relay.<tên-bạn>.workers.dev` |
| Path | `login` |
| Policy | Action **Allow**, rule **Emails ending in** `@congty.com` |
| Identity provider | Google / Microsoft Entra / One-time PIN qua email |

Zero Trust free tier: **50 người dùng**, đủ cho hầu hết nhóm.

> **Chỉ bảo vệ đúng `/login`.** Nếu đặt Access lên `/mcp` thì Cowork bị khoá
> ra ngoài — nó gọi server-to-server, không có trình duyệt để đăng nhập.
> Nếu đặt lên `/ws` thì plugin bị khoá, vì iframe của plugin không có phiên
> đăng nhập nào cả.

Không có Cloudflare Access? Đặt secret `WORKSPACE_KEY` rồi phát chuỗi đó cho
nhân viên:

```bash
npx wrangler secret put WORKSPACE_KEY
```

Yếu hơn — một bí mật dùng chung, không danh tính, không vết kiểm toán — và
relay nói thẳng điều đó. Nếu **không có cái nào** được cấu hình, relay trả
`503` chứ không chạy mở toang.

### 5. Publish plugin

Với người non-tech, đây mới là rào cản thật, không phải relay. Chừng nào
còn phải *Import plugin from manifest* thì họ còn phải tải repo về máy.

- **Có gói Organization**: publish private cho tổ chức. Không qua review,
  không lộ ra ngoài.
- **Không có**: publish công khai lên Figma Community. Qua review vài ngày,
  ai cũng cài được — nhưng relay của bạn vẫn chỉ nhận email đúng domain,
  nên người lạ cài plugin cũng không dùng được hạ tầng của bạn.

Nếu relay của bạn **không** ở `*.workers.dev`, sửa `networkAccess.allowedDomains`
trong `plugin/manifest.json` trước khi publish — Figma chặn mọi domain không
khai báo.

---

## Phần dành cho người dùng (mỗi máy một lần)

1. Mở file trong **Figma Desktop** (file bạn **có quyền sửa**).
2. Chạy plugin **Reqwise Figma MCP**.
3. Trong khối **Claude Cowork**: dán địa chỉ relay, bấm **Ghép cặp với Cowork**.
4. Bấm **Mở trang đăng nhập** → đăng nhập bằng email công ty → đóng tab.
5. Quay lại plugin: nó tự nối trong vài giây và hiện một đường dẫn.
6. Chép đường dẫn đó → Cowork → **Settings → Connectors → Add custom
   connector** → dán vào ô URL.

Từ đó về sau chỉ cần: mở file, chạy plugin, **giữ cửa sổ plugin mở**.

Mã ghép cặp sống **10 phút** và dùng **một lần**. Quá hạn thì bấm lại.

---

## Cowork làm được gì, và không làm được gì

| | Cowork (relay) | Claude Code (local) |
|---|---|---|
| 9 loại diagram | ✅ | ✅ |
| Đọc canvas, soát chéo model | ✅ | ✅ |
| `figma_write` (chạy JS trên canvas) | ❌ | ✅ |
| Design system, component, token | ❌ | ✅ |
| Slash command `/figjam-*` | ❌ | ✅ |

`figma_write` **không** có trên relay và tôi cố tình không mô phỏng nó: nó
chạy JavaScript của người gọi trong `vm` của Node, mà Workers không có —
giả lập nghĩa là chạy code lạ trong cùng isolate với relay. Không đáng.

Cowork dùng ngôn ngữ tự nhiên, không có slash command, nên hãy nói thẳng
việc cần làm: *"vẽ luồng đăng nhập có trường hợp sai mật khẩu lên board"*.
Server đã gửi kèm hướng dẫn để Claude tự gọi `figma_status` trước và đọc to
các phát hiện của checker.

---

## Hỏng thì xem đây

| Triệu chứng | Nguyên nhân |
|---|---|
| Plugin báo "Không gọi được relay" | Sai địa chỉ, hoặc domain chưa có trong `networkAccess.allowedDomains` |
| Bấm mở trang đăng nhập, không thấy Access hỏi gì | Access chưa bật, hoặc path không khớp `login`. Relay sẽ từ chối và nói rõ |
| Đăng nhập xong, plugin vẫn chờ | Mã đã quá 10 phút. Bấm ghép cặp lại |
| Cowork báo connector lỗi | Thiếu room id trong URL. Phải là `/mcp/<roomId>` |
| Cowork nối được nhưng bảo không có plugin | Cửa sổ plugin đã đóng. Nó là cây cầu |
| Relay trả 503 | Chưa cấu hình `ALLOWED_EMAIL_DOMAINS` lẫn `WORKSPACE_KEY` |

---

## Chi phí

Nằm gọn trong free tier của Cloudflare với dùng thực tế:

- Workers: 100.000 request/ngày
- Durable Objects: có trên gói **free** (dùng SQLite storage — xem
  `new_sqlite_classes` trong migration)
- WebSocket Hibernation: phòng để không **không tính tiền duration**, mà một
  phiên thiết kế phần lớn là im lặng
- Message vào tính tỉ lệ 20:1; message ra miễn phí
- Cloudflare Access: miễn phí tới 50 người dùng

Bundle relay: **~289 KiB sau gzip**.
