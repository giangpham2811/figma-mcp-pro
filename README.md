# Vẽ sơ đồ lên Figma bằng cách nói chuyện với Claude

Bạn nói bằng tiếng Việt:

> *"Vẽ giúp tôi luồng đăng nhập, có cả trường hợp nhập sai mật khẩu."*

Claude vẽ thẳng lên file Figma bạn đang mở.

Nhưng điểm chính không phải cái hình — hình thì bạn tự vẽ cũng được. Điểm
chính là **nó đọc lại bản vẽ và nói cho bạn nghe chỗ nào chưa ổn**:

> *"Câu hỏi 'Đúng mật khẩu?' chỉ có một đường đi ra. Nếu sai thì sao?"*
>
> *"Màn hình 'Quên mật khẩu' không có đường nào dẫn tới. Thừa, hay thiếu
> một bước?"*

Đó là những câu một người rà soát kỹ tính sẽ hỏi bạn trong buổi họp — khác
là nó hỏi ngay lúc bạn đang vẽ, chứ không phải hai tuần sau.

---

## Cần chuẩn bị

1. **Figma bản cài trên máy** — không phải Figma mở trong trình duyệt.
   Tải ở [figma.com/downloads](https://www.figma.com/downloads/).
2. **Quyền sửa** file bạn định vẽ vào. File người khác gửi cho xem thôi thì
   không chạy được — xem mục *Gặp trục trặc*.
3. **Claude Cowork** hoặc **Claude Code**.

---

## Cài — làm một lần

### Bước 1. Cài plugin vào Figma

Người phụ trách kỹ thuật ở công ty bạn sẽ gửi plugin, hoặc chỉ cho bạn cài
từ Figma. Nếu chưa có, nhờ họ đọc [docs/HUONG-DAN.md](docs/HUONG-DAN.md).

### Bước 2. Nối Claude với Figma

**Nếu dùng Cowork:** mở **Settings → Connectors → Add custom connector**,
điền hai ô:

| Ô | Điền |
|---|---|
| Name | `Figma` |
| MCP server URL | dán dòng dưới đây |

```
https://figjam-pro-relay.giangpm.workers.dev/mcp
```

Dán một lần, **không bao giờ phải đụng lại** — địa chỉ này dùng chung cho
cả nhóm và không đổi.

> Công ty bạn tự dựng relay riêng thì dùng đường dẫn họ gửi, thay cho dòng
> trên. Phần còn lại giống hệt.

**Nếu dùng Claude Code:** người phụ trách kỹ thuật cài giúp bằng một lệnh.
Bạn không phải làm gì ở bước này.

---

## Dùng — mỗi lần

**1.** Mở Figma trên máy, mở file bạn muốn vẽ vào.

**2.** Menu **Plugins** → chọn **Reqwise Figma MCP**.

Một ô nhỏ hiện ra bên phải, trong đó có **mã 6 ký tự** kiểu `K7P2WQ`.

> **Để nguyên ô đó, đừng đóng.** Đây là chỗ hay nhầm nhất. Đóng nó là mất
> kết nối, giống rút dây mạng. Không hỏng gì, chỉ cần mở lại.

**3.** Quay sang Claude, nói:

> mã K7P2WQ

**4.** Rồi nói việc bạn cần, bình thường:

```
Vẽ luồng đặt hàng lên board này giúp tôi

Vẽ sơ đồ các trang của app, dựa theo file spec tôi vừa gửi

Xem lại mấy bản vẽ trên board xem có chỗ nào mâu thuẫn nhau không
```

Mỗi cuộc trò chuyện mới thì đọc lại mã một lần — cuộc mới chưa biết bạn
đang mở file nào.

### Nếu dùng Claude Code: có câu lệnh tắt

| Gõ | Khi bạn muốn |
|---|---|
| `/figjam-flow` | vẽ luồng, quy trình, các bước |
| `/figjam-scope` | vẽ phạm vi: hệ thống làm được gì, gồm những trang nào |
| `/figjam-user` | vẽ chân dung người dùng, hành trình của họ |
| `/figjam-data` | vẽ sơ đồ dữ liệu: bảng, quan hệ |
| `/figjam-check` | **chỉ soát, không vẽ** — tìm chỗ sai trong bản vẽ có sẵn |
| `/figjam-pro` | không chắc mình cần gì |

```
/figjam-flow vẽ luồng thanh toán, có cả lúc thẻ bị từ chối
```

---

## Vẽ được những gì

| Bạn muốn | Nói thế nào |
|---|---|
| Người dùng đi qua những màn hình nào | *"vẽ luồng màn hình khi đăng ký"* |
| Ai làm bước nào trong quy trình | *"vẽ quy trình duyệt đơn, ai duyệt bước nào"* |
| Một đơn hàng đi qua những trạng thái nào | *"vẽ vòng đời đơn hàng"* |
| Hệ thống làm được gì, cho ai | *"vẽ use case cho app này"* |
| App gồm những trang nào | *"vẽ sơ đồ trang của sản phẩm"* |
| Người dùng trải nghiệm ra sao, khó chịu ở đâu | *"vẽ hành trình người dùng khi chờ mã OTP"* |
| Chân dung người dùng chính | *"vẽ persona cho khách hàng doanh nghiệp"* |
| Dữ liệu gồm bảng nào, liên quan ra sao | *"vẽ sơ đồ dữ liệu phần đặt hàng"* |

Có một loại chỉ vẽ được trong **file thiết kế**, không vẽ được trên
**board**: sơ đồ trao đổi theo thời gian. Lý do là board không giữ được thứ
tự trước-sau của các đường nối. Claude sẽ nói cho bạn biết nếu gặp.

---

## Ba điều nên biết trước

**Nó không bịa.** Thiếu thông tin thì nó hỏi bạn, hoặc để trống và ghi chú.
Một ô trống trên bản vẽ là **phát hiện**, không phải lỗi — đừng bảo nó
"điền đại cho đầy".

**Nó soát trước khi vẽ.** Nếu những gì bạn mô tả có mâu thuẫn, nó dừng lại
và nói ra, thay vì vẽ một bức tranh trông đẹp mà sai.

**Mã 6 ký tự là chìa khoá vào file bạn đang mở.** Nó sống 12 tiếng. Đừng
đọc nó trong buổi họp có người ngoài; lỡ rồi thì mở plugin → *Cài đặt nâng
cao* → **Lấy đường dẫn mới**.

---

## Gặp trục trặc

| Chuyện xảy ra | Làm gì |
|---|---|
| Claude bảo *"không thấy plugin nào"* | Ô plugin đã đóng, hoặc chưa chạy plugin sau khi mở Figma. Chạy lại và để đó |
| Không thấy plugin trong menu Plugins | Bạn đang dùng Figma trong trình duyệt. Phải dùng bản cài trên máy |
| Bấm chạy plugin nhưng không có gì xảy ra | File này bạn chỉ được xem. Chuột phải tên file → **Duplicate to your drafts**, rồi làm trên bản của bạn |
| Claude bảo cần *"Design file"* | Việc đó chỉ làm được trong file thiết kế, không làm được trên board |
| Nhiều cửa sổ Figma đang mở, vẽ nhầm file | Nói rõ tên file: *"vẽ vào file Thiết kế App"* |
| Vẽ xong không thấy đâu | Nhấn **Shift + 1** để thu toàn cảnh — nó đặt bản vẽ ở chỗ trống, có thể ngoài tầm nhìn |
| Mã báo hết hạn | Mở plugin, đọc mã mới |
| Báo *"Quá nhiều lần thử ghép cặp"* | Đã đọc nhầm mã nhiều lần. Đợi một phút, đọc lại mã cho đúng |

Vẫn không được thì bảo Claude: *"kiểm tra kết nối giúp tôi"*. Nó chạy chẩn
đoán và nói đúng chỗ đang kẹt.

---

## Tài khoản Figma của ai?

**Của bạn.** Plugin chạy trong Figma trên máy bạn, dưới tài khoản Figma bạn
đang đăng nhập. Nó vẽ được đúng những gì **bạn** vẽ được — không hơn.

- Không ai phải dùng chung tài khoản Figma.
- Không có mật khẩu hay khoá Figma nào được lưu ở đâu khác ngoài máy bạn.
- Mỗi người một kết nối riêng, không lẫn vào nhau.
- Người dựng hệ thống **không** vào được file Figma của bạn qua công cụ này.

Một điều nên biết cho đúng: nếu công ty dùng chung một relay, thì **nội
dung bản vẽ** (tên màn hình, nhãn các bước) có đi qua máy chủ relay đó trên
đường tới Figma. Nó không lưu lại, nhưng nó có đi qua. Với dự án nhạy cảm,
nói với người phụ trách kỹ thuật để họ dựng relay riêng, hoặc dùng bản chạy
hoàn toàn trên máy (Claude Code).

---

## Nó không làm được gì

- **Không vẽ vào file bạn chỉ có quyền xem.** Copy sang bản của bạn.
- **Phải mở Figma trên máy.** Tắt Figma là dừng.
- **Không đọc được file bạn chưa mở.**
- **Không sao chép hình dạng từ mẫu có sẵn.** Bảo *"vẽ theo template"* thì
  nó học **cách đặt tên** và **cách dùng từ** của nhóm bạn; còn hình khối
  và bố cục do nó tự tính.
- **Nó không biết bản vẽ của bạn có ĐÚNG không**, chỉ biết bản vẽ có **mạch
  lạc** không. Một sơ đồ hoàn hảo về một sản phẩm sai vẫn qua hết mọi kiểm
  tra. Phần đó vẫn là việc của bạn.

---

## Dành cho người kỹ thuật

| Việc | Đọc |
|---|---|
| Cài cho cả nhóm | [docs/HUONG-DAN.md](docs/HUONG-DAN.md) |
| Dựng relay cho Cowork | [docs/COWORK.md](docs/COWORK.md) |
| Tra tham số từng tool | [docs/TOOLS.md](docs/TOOLS.md) |
| Vì sao không dùng Figma MCP chính thức | [docs/FIGMA-MCP-VS-PLUGIN-BRIDGE.md](docs/FIGMA-MCP-VS-PLUGIN-BRIDGE.md) |
| Sửa code | [ARCHITECTURE.md](ARCHITECTURE.md) |

Fork của [reqwise-figma-mcp](https://github.com/hoangpm96/reqwise-figma-mcp)
(Hoang Phan, MIT) — xem [`LICENSE`](LICENSE) và [`NOTICE`](NOTICE).
