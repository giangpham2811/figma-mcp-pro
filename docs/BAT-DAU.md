# Bắt đầu dùng

Dành cho người **dùng**. Bạn không cần biết gì về lập trình, và trong cả
trang này không có dòng lệnh nào.

---

## Nó làm gì cho bạn

Bạn nói với Claude bằng tiếng Việt, ví dụ:

> *"Vẽ giúp tôi luồng đăng nhập, có cả trường hợp nhập sai mật khẩu."*

Claude vẽ thẳng lên file Figma bạn đang mở.

Nhưng điểm chính không phải cái hình — cái hình thì bạn tự vẽ cũng được.
Điểm chính là **nó đọc lại bản vẽ và nói cho bạn nghe chỗ nào chưa ổn**:

> *"Câu hỏi 'Đúng mật khẩu?' chỉ có một đường đi ra. Nếu sai thì sao?"*
>
> *"Màn hình 'Quên mật khẩu' không có đường nào dẫn tới. Thừa, hay thiếu
> một bước?"*

Đó là những câu một người rà soát kỹ tính sẽ hỏi bạn trong buổi họp. Khác
là nó hỏi ngay lúc bạn đang vẽ, chứ không phải hai tuần sau.

---

## Cần chuẩn bị gì

Ba thứ, và bạn chắc đã có hai:

1. **Figma bản cài trên máy** (không phải Figma mở trong trình duyệt).
   Tải ở figma.com/downloads nếu chưa có.
2. **Quyền sửa file** bạn định vẽ vào. File người khác gửi bạn xem thôi
   thì không được — xem mục *Gặp trục trặc* bên dưới.
3. **Claude Cowork** hoặc **Claude Code**. Phần dưới nói cả hai.

Nếu công ty bạn chưa cài công cụ này, nhờ người phụ trách kỹ thuật làm theo
[HUONG-DAN.md](./HUONG-DAN.md) — họ làm một lần cho cả nhóm.

---

## Dùng với Claude Cowork

### Lần đầu (khoảng một phút)

**1.** Mở Cowork → **Settings** → **Connectors** → **Add custom connector**.
Điền hai ô:

| Ô | Điền gì |
|---|---|
| Name | `Figma` |
| MCP server URL | `https://figjam-pro-relay.giangpm.workers.dev/mcp` |

Đường dẫn này **dùng chung cho cả nhóm và không bao giờ đổi**. Nếu người
phụ trách kỹ thuật đã gửi bạn đường dẫn khác thì dùng của họ.

**2.** Mở Figma trên máy, mở file bạn muốn vẽ vào.

**3.** Menu **Plugins** → chọn **Reqwise Figma MCP**.

Một ô nhỏ hiện ra bên phải, trong đó có **một mã 6 ký tự** kiểu `K7P2WQ`.
**Cứ để ô đó nguyên, đừng đóng** — đây là chỗ hay nhầm nhất. Đóng nó là mất
kết nối, giống rút dây mạng.

**4.** Quay sang Claude, nói:

> mã K7P2WQ

Xong. Claude nhớ mã đó trong suốt cuộc trò chuyện.

### Những lần sau

Mở Figma → chạy plugin → đọc mã cho Claude. **Không phải đụng vào phần
Settings của Cowork nữa** — đường dẫn đã lưu rồi.

Mỗi cuộc trò chuyện mới thì đọc lại mã một lần, vì cuộc trò chuyện mới chưa
biết bạn đang mở file nào.

### Rồi nói chuyện bình thường

```
Vẽ luồng đặt hàng lên board này giúp tôi

Vẽ sơ đồ các trang của app, dựa theo file spec tôi vừa gửi

Xem lại mấy bản vẽ trên board xem có chỗ nào mâu thuẫn nhau không
```

Không cần nhớ câu lệnh. Cứ nói điều bạn muốn.

---

## Dùng với Claude Code

Giống hệt, chỉ khác là **có sẵn câu lệnh tắt** để bạn khỏi phải mô tả dài:

| Gõ | Khi bạn muốn |
|---|---|
| `/figjam-flow` | vẽ luồng, quy trình, các bước |
| `/figjam-scope` | vẽ phạm vi: hệ thống làm được gì, gồm những trang nào |
| `/figjam-user` | vẽ chân dung người dùng, hành trình của họ |
| `/figjam-data` | vẽ sơ đồ dữ liệu: bảng, quan hệ |
| `/figjam-check` | **chỉ soát, không vẽ** — tìm chỗ sai trong bản vẽ có sẵn |
| `/figjam-pro` | không chắc mình cần gì |

Viết tiếp bằng tiếng Việt ngay sau lệnh:

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
| Chân dung người dùng chính | *"vẽ persona cho nhóm khách hàng doanh nghiệp"* |
| Dữ liệu gồm bảng nào, liên quan ra sao | *"vẽ sơ đồ dữ liệu phần đặt hàng"* |

Có một loại chỉ vẽ được trong **file thiết kế**, không vẽ được trên **board**:
sơ đồ trao đổi theo thời gian (sequence). Lý do là board không giữ được thứ
tự trước-sau của các đường nối. Claude sẽ nói cho bạn biết nếu gặp.

---

## Bốn điều nên biết trước

**Nó không bịa.** Thiếu thông tin thì nó hỏi bạn, hoặc để trống và ghi chú.
Một ô trống trên bản vẽ là **phát hiện**, không phải lỗi. Đừng bảo nó "điền
đại cho đầy".

**Nó soát trước khi vẽ.** Nếu model bạn mô tả có mâu thuẫn, nó dừng lại và
nói ra trước, thay vì vẽ một bức tranh trông đẹp mà sai.

**Mã 6 ký tự là chìa khoá vào file Figma bạn đang mở.** Nó sống 12 tiếng.
Đừng đọc nó trong buổi họp có người ngoài, và nếu lỡ thì mở plugin → *Cài
đặt nâng cao* → **Lấy đường dẫn mới** để đổi mã.

Riêng đường dẫn dán vào Settings thì dùng chung cho cả nhóm — nó không tự
nó mở được file nào.

**Ô plugin phải luôn mở.** Đóng nó là mất kết nối. Không hỏng gì cả, chỉ cần
mở lại.

---

## Gặp trục trặc

| Chuyện xảy ra | Làm gì |
|---|---|
| Claude bảo *"không thấy plugin nào"* | Ô plugin đã đóng, hoặc bạn chưa chạy plugin sau khi mở Figma. Chạy lại và để đó. |
| Trong Figma không thấy plugin trong menu Plugins | Bạn đang dùng Figma trong trình duyệt. Phải dùng bản cài trên máy. |
| Bấm chạy plugin nhưng không có gì xảy ra | File này bạn chỉ được xem, không được sửa. Bấm chuột phải tên file → **Duplicate to your drafts**, rồi làm trên bản copy của bạn. |
| Claude bảo cần *"Design file"* | Việc đó (component, design system, kiểm tra tiếp cận) chỉ làm được trong file thiết kế, không làm được trên board. |
| Có nhiều cửa sổ Figma đang mở, nó vẽ nhầm file | Nói rõ tên file: *"vẽ vào file Thiết kế App"*. |
| Vẽ xong không thấy đâu | Nhìn lại toàn trang — nó đặt bản vẽ ở chỗ trống, có thể ngoài tầm nhìn hiện tại. Nhấn **Shift + 1** để thu toàn cảnh. |

Nếu vẫn không được, bảo Claude: *"kiểm tra kết nối giúp tôi"*. Nó sẽ chạy
chẩn đoán và nói đúng chỗ đang kẹt.

---

## Nó không làm được gì

Nói trước để bạn không phát hiện lúc đang họp:

- **Không vẽ được vào file bạn chỉ có quyền xem.** Copy sang bản của bạn.
- **Phải mở Figma trên máy.** Không chạy ngầm, không chạy khi bạn tắt Figma.
- **Không đọc được file bạn chưa mở.**
- **Không sao chép hình dạng từ mẫu có sẵn.** Nếu bạn bảo *"vẽ theo
  template"*, nó học **cách đặt tên** và **cách dùng từ** của nhóm bạn —
  còn hình khối và bố cục thì do nó tự tính.
- **Nó không biết bản vẽ của bạn có ĐÚNG không**, chỉ biết bản vẽ có **mạch
  lạc** không. Một sơ đồ hoàn hảo về một sản phẩm sai thì vẫn qua hết mọi
  kiểm tra. Phần đó vẫn là việc của bạn.
