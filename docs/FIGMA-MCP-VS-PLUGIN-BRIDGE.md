# Figma MCP chính thức vs. kiến trúc plugin-bridge

*Cập nhật 21/09/2026. Mọi số liệu về giá và hạn mức đều dẫn nguồn ở cuối file —
Figma đổi bảng giá khá thường xuyên, nên kiểm lại trước khi đem đi thuyết phục ai.*

Câu hỏi đặt ra: Figma có MCP server chính thức nối thẳng vào Claude, nhưng nó
giới hạn lượt gọi và tốn tiền. Dự án này né bằng cách nào?

Câu trả lời ngắn: **không né bằng cách lách, mà bằng cách đi cửa khác.** Figma
có hai bề mặt lập trình hoàn toàn tách biệt, và chúng có mô hình tính phí khác
nhau vì chúng là hai sản phẩm khác nhau. Figma MCP chính thức là một dịch vụ
chạy trên máy chủ Figma, bán theo seat. Plugin API là môi trường chạy script
bên trong ứng dụng Figma Desktop, và nó miễn phí vì Figma muốn có hệ sinh thái
plugin. Dự án này dựng một cây cầu WebSocket tới một plugin, nên mọi thao tác
đi qua bề mặt thứ hai.

Phần dưới nói rõ cả cái được lẫn cái mất — vì có những thứ **không** né được,
và biết trước thì tốt hơn là phát hiện lúc đã viết xong 5.000 dòng.

---

## 1. Figma MCP chính thức: nó là gì và thu tiền ở đâu

Figma cung cấp hai bản MCP server:

| | Desktop (local) | Remote |
|---|---|---|
| Chạy ở đâu | Figma Desktop mở cổng `http://127.0.0.1:3845/mcp` | Máy chủ Figma |
| Điều kiện seat | Cần **Dev hoặc Full seat trên gói trả phí** | Mọi seat, mọi gói |
| Dùng để | Đọc file đang mở | Đọc file theo URL |

**Hạn mức gọi tool** (đây chính là cái "giới hạn" bạn nhắc tới):

| Gói | Seat View / Collab | Seat Dev / Full |
|---|---|---|
| Starter (free) | ~20 lượt/tháng | — |
| Professional | ~6 lượt/tháng | **200 lượt/ngày, 10 lượt/phút** |
| Organization | ~6 lượt/tháng | **600 lượt/ngày, 20 lượt/phút** |
| Enterprise | — | 600 lượt/ngày, 20 lượt/phút |

**Giá seat** (gói Professional, trả theo tháng): Dev seat **$12/tháng**, Full
seat **$16/tháng**.

Ba con số cần nhìn cho kỹ:

- **6 lượt/tháng** cho seat View/Collab. Đây thực chất là bản dùng thử. Một
  phiên làm việc thật với agent tiêu hết trong ba phút.
- **10 lượt/phút** cho seat Dev/Full. Nghe thoải mái, cho tới khi bạn để agent
  tự chạy. Một vòng lặp "đọc → sửa → đọc lại để kiểm chứng" là 3 lượt; agent
  làm 4 màn hình là chạm trần trong vòng một phút.
- **Dev seat là read-only ngoài phạm vi drafts.** Muốn *ghi* lên file thật thì
  phải Full seat.

### Vì sao tốn token

Hạn mức lượt gọi chỉ là một nửa chi phí. Nửa còn lại là context.

Tool chủ lực của Figma MCP là `get_code`: bạn chọn một frame, nó trả về code
React + Tailwind cho **toàn bộ cây node** của frame đó. Với một màn hình thật
— header, sidebar, bảng, modal — kết quả là vài chục nghìn token đổ thẳng vào
context window, phần lớn là markup mà model không cần để làm việc bạn đang
nhờ. Hỏi "cái nút này màu gì" cũng phải trả tiền cho cả cái màn hình.

Đây không phải lỗi thiết kế. Figma MCP được thiết kế cho luồng **design → code
một chiều**: lấy một frame, sinh ra component. Với mục đích đó thì trả cả cây
là đúng. Nó chỉ đắt khi bạn dùng nó như một API đọc-ghi tương tác.

---

## 2. Bề mặt thứ hai: Figma Plugin API

Plugin API là thứ mọi plugin trên Figma Community đang chạy. Nó là một môi
trường JavaScript **bên trong ứng dụng Figma Desktop**, có toàn quyền đọc và
ghi lên file đang mở: tạo node, sửa thuộc tính, tạo component, gán variable,
đọc selection.

Ba đặc điểm quyết định:

1. **Không đi qua máy chủ Figma.** Plugin chạy trong tiến trình của app, thao
   tác trực tiếp lên document trong bộ nhớ. Không có API call nào rời máy bạn,
   nên không có gì để Figma đếm.
2. **Không tính phí, không cần seat đặc biệt.** Figma không thu tiền việc chạy
   plugin — họ muốn có hệ sinh thái plugin. Quyền ghi của plugin bằng đúng
   quyền của bạn trên file đó, không hơn không kém.
3. **Nó *ghi* được.** Figma MCP chính thức về cơ bản là để đọc; Plugin API là
   cách duy nhất để một agent thực sự *vẽ* lên canvas.

### Cây cầu

```
Claude Code ──stdio(MCP)──> MCP server (Node) ──WebSocket──> Plugin ──> Figma Desktop
                              localhost:38470              (chạy trong app)
```

MCP server là một tiến trình Node bình thường, nói chuyện MCP với Claude và
WebSocket với plugin. Plugin nhận lệnh, gọi Plugin API, trả kết quả. Không
khâu nào chạm vào Figma MCP endpoint, nên **không hạn mức nào áp vào**.

---

## 3. Tiết kiệm token bằng cách nào

Không đụng hạn mức mới là một nửa. Nửa kia là chủ động cắt token, và đây là
chỗ kiến trúc này khác hẳn về bản chất:

**Gộp nhiều thao tác vào một vòng.** `figma.batch([...200 ops])` chia thành
từng chunk 20 và stream qua một lần gọi. Với Figma MCP, 200 thao tác là 200
lượt gọi — tức 20 phút chờ hạn mức, nếu nó cho ghi.

**Chỉ trả cái bất thường.** `layout_audit(nodeId)` duyệt cả cây nhưng chỉ trả
về những node **có vấn đề** (tràn khung, bị cắt, chữ bị nuốt, sai z-order).
Một frame 250 layer sạch sẽ trả về một dòng tóm tắt, không phải 250 bản ghi.
Muốn đầy đủ thì `verbose: true`.

**Nén lúc serialize.** Ở mức `detail: "design"`, một fill đặc trả về
`{type:"SOLID", hex:"#101827"}` thay vì bốn số thực full-precision; các field
đúng bằng mặc định của Figma (`visible:true`, `opacity:1`, `blendMode:"NORMAL"`)
bị bỏ; mảng `strokes`/`effects` rỗng bị bỏ hẳn.

**Ảnh là ảnh, không phải base64.** `screenshot` trả về MCP image block thật,
tính theo image token. Nhiều MCP server trả base64 trong text field — vài chục
nghìn text token cho một cái ảnh.

**Trạng thái sống qua nhiều lượt gọi.** Bảng token, map node id, hằng số nằm
trong `session.state` và tồn tại giữa các lần `figma_write`. Không phải khai
báo lại design system mỗi lần gọi.

**Viết code thay vì gọi tool.** `figma_write` nhận một đoạn JS chạy trong sandbox
`vm`. Một vòng lặp tạo 12 card là *một* lượt gọi với một đoạn code ngắn, thay
vì 12 lần gọi tool với 12 khối JSON.

---

## 4. So sánh

| | Figma MCP chính thức | Plugin-bridge (dự án này) |
|---|---|---|
| Chi phí | $12–16/seat/tháng (Dev/Full) | $0 cho lớp API |
| Hạn mức | 200–600 lượt/ngày, 10–20/phút | Không có |
| Ghi lên canvas | Chỉ Full seat, phạm vi hẹp | Đầy đủ Plugin API |
| Token mỗi lần đọc | Cả cây React+Tailwind | Đã nén, lọc, chỉ phần liên quan |
| Nhiều thao tác | 1 thao tác = 1 lượt | `batch` 200 thao tác = 1 lượt |
| Cần gì để chạy | Tài khoản trả phí | Figma Desktop mở + cài plugin |
| Đọc file không mở | Được (bản remote) | **Không** |
| Code Connect chính thức | Có | Không (phải tự làm) |
| Ai bảo trì | Figma | Bạn |

---

## 5. Chỗ KHÔNG bypass được

Phần này quan trọng ngang phần trên. Đừng để ai bán cho bạn cái này như một
phương án thay thế toàn diện — nó không phải.

**Vẫn phải có tài khoản Figma với quyền sửa file.** Plugin chạy dưới danh
nghĩa bạn. Nếu tài khoản bạn chỉ xem được file, plugin cũng chỉ xem được. Cái
được miễn là **lớp MCP**, không phải quyền truy cập file.

**Gói Starter (free) có giới hạn riêng** về số file design và số page mỗi file.
Giới hạn này thuộc về sản phẩm Figma, không phải lớp MCP, nên không cửa nào né
được. Kiểm tra hạn mức hiện hành trên trang pricing.

**Figma Desktop phải đang mở, plugin phải đang chạy.** Không có chế độ
headless, không chạy CI được. Figma MCP bản remote đọc file theo URL mà không
cần mở gì — cái đó kiến trúc này không làm được, và sẽ không bao giờ làm được.

**Plugin API có thể đổi.** Đây là API công khai có version, nhưng Figma không
nợ bạn lời hứa tương thích ngược nào cho một plugin tự cài. Có deprecation
thật (`getNodeById` đồng bộ đã bị thay bằng bản async khi chế độ
`dynamic-page` ra đời).

**Không có Code Connect chính thức.** Ánh xạ component Figma ↔ component code
là sản phẩm của Figma và nó gắn với hạ tầng của họ. Tự dựng được một bản, nhưng
là bản của bạn, không phải bản họ hỗ trợ.

**Chuyện điều khoản dịch vụ.** Dùng Plugin API để tự động hóa công việc của
chính mình là đúng mục đích Plugin API sinh ra. Cái sẽ thành vấn đề là bán lại
quyền truy cập Figma cho người không có tài khoản, hoặc lách giới hạn số ghế
bằng cách cho nhiều người dùng chung một phiên. Ranh giới nằm ở đó, và nó khá
rõ: **tự động hóa quyền bạn đã có thì được; phân phát quyền bạn không có thì
không.**

---

## 6. Kết luận thực dụng

Hai thứ này không thay thế nhau, chúng giải quyết hai bài toán khác nhau:

- **Cần đọc một file Figma bất kỳ theo URL, trong CI, không mở app, và muốn
  Code Connect chính thức** → dùng Figma MCP, trả tiền seat.
- **Cần agent *vẽ* lên canvas, chạy hàng trăm thao tác một phiên, và không
  muốn mỗi lần đọc ngốn 30k token** → plugin-bridge, và hạn mức biến mất vì
  bạn không còn ở trên đường có đặt trạm thu phí.

Với đúng mục đích của dự án này — agent tự dựng design system, vẽ diagram,
sinh component — thì cửa thứ hai không chỉ rẻ hơn, nó là cửa duy nhất mở.
Figma MCP chính thức không cho ghi kiểu này dù bạn có trả bao nhiêu tiền.

---

## Nguồn

- [Rate limits & access — Figma Developer Docs](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
- [Get started with the Figma MCP server — Figma Help Center](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)
- [Guide to the Figma MCP server — Figma Help Center](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Plans & Pricing — Figma](https://www.figma.com/pricing/)
- [figma/mcp-server-guide — GitHub](https://github.com/figma/mcp-server-guide)
