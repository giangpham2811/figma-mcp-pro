# Cowork — phần kỹ thuật

Dành cho người **dựng và vận hành**. Người dùng cuối chỉ cần
[README](../README.md), ở đó không có dòng lệnh nào.

## Vì sao phải có relay

Cowork chạy trên máy chủ của Anthropic, không phải trên máy người dùng. Nó
không mở được chương trình nào trên máy họ và không nhìn thấy máy họ. Nên
bản chạy nội bộ là vô hình với nó.

May là plugin Figma **gọi ra ngoài** chứ không chờ ai gọi vào. Vậy chỉ cần
cho cả hai bên cùng gọi tới một địa chỉ công khai là chúng gặp nhau ở đó.

```
Cowork  ──►  relay (Cloudflare Worker)  ◄──  plugin  ──►  Figma
```

Với người dùng, toàn bộ chuyện này vô hình: họ mở plugin, chép một dòng,
dán vào Cowork.

---

## Người dùng làm gì

Dán **một** đường dẫn vào Cowork, một lần duy nhất:

```
https://figjam-pro-relay.giangpm.workers.dev/mcp?key=KHOA-CONG-TY
```

Đường dẫn đó **giống nhau cho mọi người** và không bao giờ đổi, nên bạn
phát cho cả công ty trước được. Sau đó mỗi người chỉ cần mở plugin và đọc
mã 6 ký tự cho Claude.

Phần `?key=` là khoá chung của công ty. Nó **không nằm trong kho mã** — bạn
phát qua kênh nội bộ. Xem *Khoá vào cửa* bên dưới.

Chi tiết cho người dùng: [README](../README.md).

### Vì sao là mã chứ không phải URL riêng

Bản đầu cấp cho mỗi người một URL 80 ký tự và bắt họ chép từ Figma sang
Cowork. Chạy được, nhưng đó là thao tác chép-dán giữa hai ứng dụng mà người
ta làm sai thường xuyên, và nó chặn mất khả năng phát cấu hình sẵn cho cả
nhóm.

Giờ URL là chung, còn cửa sổ Figma được gọi tên bằng sáu ký tự **đọc được
qua điện thoại**. Bảng mã bỏ hẳn `O`, `0`, `I`, `1`, `L` — đúng những ký tự
người ta nghe nhầm.

Ai không muốn dùng mã thì URL riêng vẫn chạy: `…/mcp/<roomId>`, plugin hiện
nó ở *Cài đặt nâng cao*.

### Khoá vào cửa

Không có đăng nhập, và đó là chủ ý. Ô *Add custom connector* của Cowork chỉ
có hai trường — Name và URL — nên mọi bước nằm ngoài hai trường đó là bước
phần lớn người dùng sẽ không làm. Thứ duy nhất đi lọt qua hai trường đó là
một chuỗi trong URL.

Vậy nên khoá đi trong URL. Relay nhận nó ở **ba chỗ**, tuỳ client làm được gì:

| Cách gửi | Ai dùng |
|---|---|
| `Authorization: Bearer <khoá>` | Claude Code, curl, client HTTP bình thường |
| `X-Workspace-Key: <khoá>` | client đã dùng Authorization cho việc khác |
| `?key=<khoá>` trong URL | **Cowork** — không có chỗ nào đặt header |

Header vẫn tốt hơn query, vì query lọt vào log proxy và lịch sử trình
duyệt. Ưu tiên header ở đâu đặt được.

#### Đặt khoá

```bash
cd relay
npx wrangler secret put WORKSPACE_KEY
```

**Secret, không phải `vars`.** `wrangler.jsonc` được commit; secret thì
không. Có một test chặn việc khoá lọt vào README hay docs, và nó chặn
*trước khi* commit — vì git giữ lại mọi thứ đã nhận, xoá file sau không xoá
được lịch sử.

Đổi khoá cũng đúng lệnh đó. Khoá cũ chết ngay, cả nhóm dán lại đường dẫn.

#### Còn lại gì sau khoá

Ba lớp, không lớp nào thừa:

- **Khoá** chặn người ngoài chạm tới `/mcp`.
- **Bộ đếm lần đoán mã** chặn người *có* khoá dò mã 6 ký tự. Mã có 31⁶ ≈ 887
  triệu tổ hợp — nghe nhiều, nhưng đoán sai không mất gì thì số đó không
  bảo vệ ai. Giới hạn 10 lần/phút cho mỗi IP.
- **Figma** vẫn là lớp chặn cuối và là lớp thật nhất: plugin chỉ chạy được
  trên file người dùng có quyền **sửa**, nên một room không bao giờ với tới
  canvas mà chủ nhân của nó chưa mở sẵn.

Room id (192 bit, trong URL dạng `/mcp/<roomId>`) vẫn là bí mật như cũ. Thu
hồi: plugin → *Cài đặt nâng cao* → **Lấy đường dẫn mới**.

#### Bộ đếm đó đặt ở đâu, và vì sao không dùng thứ có sẵn

Cloudflare có sẵn binding `ratelimits`, đã thử trước tiên. Đo trên bản
deploy thật: 14 lần gọi **trong cùng một request** thì nó chặn từ lần 12,
nhưng 14 lần gọi thành **14 request riêng** thì lọt hết — nó đếm cục bộ
theo từng máy ở edge. Mà dò mã thì đến dưới dạng request riêng.

Nên bộ đếm nằm trong Durable Object, dưới cái tên cố định `pair-guard`
(`relay/src/room.ts`). Tên cố định nghĩa là một instance duy nhất trên toàn
cầu, tức là đếm được thật. Đếm trong bộ nhớ, không ghi storage: object bị
thu hồi thì quên, mà thu hồi chỉ xảy ra sau một lúc không ai gọi — tức là
kẻ dò đã nghỉ.

---

## Muốn chặt hơn nữa (tuỳ chọn)

Khoá chung đã bật sẵn (mục *Khoá vào cửa*). Nó cho biết người gọi **thuộc
công ty**, không cho biết **là ai** — không danh tính, không vết kiểm toán.
Cần tới mức đó thì làm tiếp cách dưới.

### Xác minh email công ty

Đặt `ALLOWED_EMAIL_DOMAINS` trong `relay/wrangler.jsonc`, deploy lại, rồi
thêm Cloudflare Access **chỉ cho path `/login`**. Khi đó plugin sẽ hiện mã
6 ký tự và bắt người dùng đăng nhập trước khi cấp đường dẫn.

Chặt nhất, và cũng nhiều bước nhất — cả cho admin lẫn người dùng. Các bước
chi tiết ở phần *Dựng relay riêng* bên dưới.

`GET /health` nói relay đang ở chế độ nào **và lớp bảo vệ nào thật sự đang
sống**. Cái sau mới quan trọng: một secret chưa ai `put`, hay một binding
rơi mất sau lần sửa `wrangler.jsonc`, nhìn từ ngoài giống hệt lúc bình
thường.

```bash
curl https://figjam-pro-relay.giangpm.workers.dev/health
# {"mode":"workspace-key","guards":{"workspaceKey":true,"pairGuess":"durable-object"}}
```

`workspaceKey: false` nghĩa là relay đang **mở toang** — bất kỳ ai biết địa
chỉ đều gọi được.

---

## Dựng relay riêng (nếu không muốn dùng relay sẵn)

### 1. KV namespace

```bash
cd relay
npx wrangler kv namespace create PAIRS
```

Chép `id` vào `relay/wrangler.jsonc`.

### 2. Deploy

```bash
npx wrangler deploy
```

Ghi lại địa chỉ. Nếu **không** ở `*.workers.dev`, thêm domain đó vào
`networkAccess.allowedDomains` trong `plugin/manifest.json` — Figma chặn mọi
domain không khai báo.

### 3. Đặt khoá

```bash
npx wrangler secret put WORKSPACE_KEY
```

Bỏ bước này thì relay mở cho bất kỳ ai biết địa chỉ. `GET /health` sẽ nói
thẳng: `"workspaceKey": false`.

### 4. Trỏ plugin sang relay của bạn

Plugin → *Cài đặt nâng cao* → điền địa chỉ → **Lấy đường dẫn mới**. Lựa
chọn này được nhớ lại cho lần sau.

<details>
<summary>Bật xác minh email công ty (cách B ở trên)</summary>

**3a.** Trong `relay/wrangler.jsonc`:

```jsonc
"vars": { "ALLOWED_EMAIL_DOMAINS": "ikameglobal.com" }
```

Nhiều domain ngăn bằng dấu phẩy. So khớp **chính xác**, không phải hậu tố,
nên `evil-ikameglobal.com` không lọt. Deploy lại.

**3b.** Cloudflare dashboard → **Zero Trust**. Lần đầu phải chọn một *team
name* và gói **Free** (tới 50 người dùng).

**3c.** **Settings → Authentication → Login methods → Add new**. Nhanh nhất
là **One-time PIN** — không cần cấu hình gì, Cloudflare gửi mã tới email, và
kết hợp với policy domain thì vẫn chứng minh người đó đọc được hộp thư công
ty. Dùng Google Workspace hoặc Microsoft Entra ID nếu có.

**3d.** **Workers & Pages → `figjam-pro-relay` → tab Access → Protect this
Worker** → chọn bảo vệ **một path**, điền `login`. Nếu bản dashboard chưa có
tab đó: **Zero Trust → Access controls → Applications → Create new →
Self-hosted**, Domain là hostname Worker, **Path** là `login`, policy
*Allow* + *Emails ending in* `@ikameglobal.com`.

> **Chỉ path `/login`, đừng bảo vệ cả Worker.** Access phủ toàn Worker sẽ
> khoá `/mcp` (Cowork gọi server-to-server, không có trình duyệt) và `/ws`
> (plugin là iframe, không có phiên đăng nhập). Mọi thứ ngừng chạy và lỗi
> không nói lý do.

**3e.** Kiểm:

```bash
curl -s "https://<host>/login?code=TEST99" -H "User-Agent: Mozilla/5.0" -i | head -5
```

**302 tới `*.cloudflareaccess.com`** là đúng. **403 "Nobody's identity was
verified"** nghĩa là Access chưa áp vào path đó.

Mở URL đó trong trình duyệt, đăng nhập, và thấy *"Mã ghép cặp không tồn tại
hoặc đã hết hạn"* — đó là **thành công**, vì `TEST99` là mã bịa: Access đã
cho qua và relay đã đọc được email bạn.

</details>

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
| Cowork báo connector lỗi, relay trả 401 | Thiếu `?key=` hoặc khoá sai. `GET /health` xem `guards.workspaceKey` |
| Báo "Quá nhiều lần thử ghép cặp" | Bộ đếm đã chặn: quá 10 lần đoán mã trong một phút từ cùng một IP |
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
- `pair-guard`: một Durable Object, chỉ chạm tới khi có người gọi
  `figma_pair` — vài lần một ngày, không phải mỗi lần vẽ

Bundle relay: **~289 KiB sau gzip**.
