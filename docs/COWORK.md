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
https://figjam-pro-relay.giangpm.workers.dev/mcp
```

Đường dẫn đó **giống nhau cho mọi người** và không bao giờ đổi, nên bạn
phát cho cả công ty trước được. Sau đó mỗi người chỉ cần mở plugin và đọc
mã 6 ký tự cho Claude.

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

### Đường dẫn đó chính là chìa khoá

Không có đăng nhập, và đó là chủ ý. Ô *Add custom connector* của Cowork chỉ
có hai trường — Name và URL — nên mọi bước nằm ngoài hai trường đó là bước
phần lớn người dùng sẽ không làm.

Bảo mật nằm trong chính URL: room id là **192 bit ngẫu nhiên**, không đoán
được. Cùng mô hình với link chia sẻ Figma hay Google Docs — **ai cầm được
link thì có quyền**.

Hai điều đi kèm, cần biết rõ:

- **Ai có URL thì vẽ được lên file Figma bạn đang mở.** Đừng dán nó vào
  chat nhóm hay commit vào repo.
- **Figma vẫn là lớp chặn thật.** Plugin chỉ chạy được trên file bạn có
  quyền **sửa**, nên một room không bao giờ với tới canvas mà chủ nhân của
  nó chưa mở sẵn.

Muốn thu hồi? Plugin → *Cài đặt nâng cao* → **Lấy đường dẫn mới**. Đường dẫn
cũ chết ngay, và bạn dán đường dẫn mới vào Cowork.

---

## Muốn chặt hơn (tuỳ chọn)

Chỉ làm nếu bạn thực sự cần. Cả hai cách đều thêm bước cho người dùng cuối.

### Cách A — khoá chung

Một chuỗi bí mật, phát cho nhân viên, nhập một lần trong plugin:

```bash
cd relay && npx wrangler secret put WORKSPACE_KEY
```

Người không có khoá không mở được room trên relay của bạn. Không có danh
tính, không có vết kiểm toán — nhưng chỉ tốn một lần dán.

### Cách B — xác minh email công ty

Đặt `ALLOWED_EMAIL_DOMAINS` trong `relay/wrangler.jsonc`, deploy lại, rồi
thêm Cloudflare Access **chỉ cho path `/login`**. Khi đó plugin sẽ hiện mã
6 ký tự và bắt người dùng đăng nhập trước khi cấp đường dẫn.

Chặt nhất, và cũng nhiều bước nhất — cả cho admin lẫn người dùng. Các bước
chi tiết ở phần *Dựng relay riêng* bên dưới.

`GET /health` cho biết relay đang ở chế độ nào:

```bash
curl https://figjam-pro-relay.giangpm.workers.dev/health
# {"mode":"open (the room id in the URL is the credential)"}
```

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

### 3. Trỏ plugin sang relay của bạn

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
