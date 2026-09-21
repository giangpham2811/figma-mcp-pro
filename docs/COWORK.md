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

## Relay đã deploy sẵn

```
https://figjam-pro-relay.giangpm.workers.dev
```

Đã dựng trên tài khoản `giangpm@ikameglobal.com`, `ALLOWED_EMAIL_DOMAINS`
đặt là `ikameglobal.com`. Đã kiểm bằng cách gọi thật: `initialize`,
`tools/list`, và một `figma_diagram` `dryRun` chạy trọn checker.

**Còn một bước bắt buộc trước khi dùng được: bật Cloudflare Access cho
`/login`** (mục 4 bên dưới). Cho tới lúc đó `/login` trả 403 kèm đúng lý
do — nó **fail closed**, không phải fail open, nên chưa ai ghép cặp được và
cũng không ai lọt qua.

Nếu bạn dựng bản của riêng mình thì làm theo các bước dưới đây.

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

Đây là bước **xác minh email thật**. Không có nó, `/login` trả 403 và không
ai ghép cặp được — relay **fail closed**.

**Điều quan trọng nhất: chỉ bảo vệ path `/login`.** Access phủ cả Worker sẽ
khoá luôn `/mcp` (Cowork gọi server-to-server, không có trình duyệt để đăng
nhập) và `/ws` (plugin là iframe, không có phiên đăng nhập). Kết quả là mọi
thứ ngừng chạy và lỗi không nói lý do.

#### 4a. Onboard Zero Trust (lần đầu, một lần duy nhất)

Cloudflare dashboard → **Zero Trust** ở thanh bên. Lần đầu nó bắt chọn một
**team name** (ví dụ `ikame`) — đó là tên miền đăng nhập của tổ chức bạn,
dạng `ikame.cloudflareaccess.com`. Chọn gói **Free** (tới 50 người dùng).

#### 4b. Thêm nhà cung cấp danh tính

**Zero Trust → Settings → Authentication → Login methods → Add new**.

- **Google Workspace** nếu công ty dùng Google — xác minh domain thật.
- **Microsoft Entra ID** nếu dùng Microsoft 365.
- **One-time PIN** không cần cấu hình gì: Cloudflare gửi mã 6 số tới email.
  Kết hợp với policy domain bên dưới thì vẫn xác minh được người đó **đọc
  được hộp thư** `@ikameglobal.com`. Đây là đường nhanh nhất để chạy thử.

#### 4c. Tạo Access application chỉ cho `/login`

Có hai lối vào cùng một chỗ. Lối đi từ Worker dễ hơn vì nó biết sẵn hostname
`workers.dev`:

**Workers & Pages → `figjam-pro-relay` → tab Access → Protect this Worker.**
Chọn bảo vệ **một path cụ thể**, không phải toàn bộ Worker, rồi điền `login`.

Nếu bản dashboard của bạn chưa có tab đó, đi đường cũ:

**Zero Trust → Access controls → Applications → Create new application →
Self-hosted:**

| Ô | Điền |
|---|---|
| Application name | `figjam-pro login` |
| Domain / Public hostname | `figjam-pro-relay.giangpm.workers.dev` |
| **Path** | `login` |
| Session duration | 24 giờ là hợp lý |

Rồi **Add a policy**:

| Ô | Điền |
|---|---|
| Policy name | `ikame staff` |
| Action | **Allow** |
| Include → selector | **Emails ending in** |
| Value | `@ikameglobal.com` |

Chọn identity provider ở bước 4b, rồi **Save / Create**.

#### 4d. Kiểm lại

```bash
curl -s "https://figjam-pro-relay.giangpm.workers.dev/login?code=TEST99"   -H "User-Agent: Mozilla/5.0" -i | head -5
```

- **302 tới `*.cloudflareaccess.com`** → đúng rồi. Access đang chặn.
- **403 kèm "Nobody's identity was verified"** → Access chưa áp vào path
  này. Kiểm lại path có đúng là `login` không (không có dấu `/` đầu, không
  có `*`).

Sau đó mở đúng URL đó trong trình duyệt: phải thấy màn đăng nhập, và sau khi
đăng nhập bằng email `@ikameglobal.com` phải thấy trang *"Mã ghép cặp không
tồn tại hoặc đã hết hạn"* — đó là **thành công**, vì `TEST99` là mã bịa.
Nghĩa là Access đã cho qua và relay đã đọc được email của bạn.

#### Không có Zero Trust? Dùng khoá chung

Yếu hơn — một bí mật dùng chung, không danh tính, không vết kiểm toán — và
relay nói thẳng điều đó:

```bash
npx wrangler secret put WORKSPACE_KEY
```

Khi đã đặt, plugin nối bằng `?key=<chuỗi>` và bỏ qua ghép cặp. Nếu **không
có cái nào** được cấu hình, relay trả `503` chứ không chạy mở toang.

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
