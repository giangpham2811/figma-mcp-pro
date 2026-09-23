# Thư phản hồi Figma sau khi bị từ chối

## Lý do từ chối, đọc đúng

> *"we're not able to approve apps that overlap with native capabilities in
> the Figma MCP server. Consider building skills on top of the official
> use_figma tool."*

Đây là **quyết định phân loại**, không phải chê chất lượng. Nộp lại bản cũ
với ảnh đẹp hơn sẽ trượt tiếp.

Nhưng họ mời phản hồi: *"If you have questions or want feedback on a
revised version, feel free to reach out."* Đó là một cánh cửa mở, không
phải câu xã giao. Dùng nó.

## Hai điều phải biết trước khi viết

**Lập luận "plugin khác cũng thế" vừa mạnh vừa yếu.**

Mạnh: có thật, nhiều, và vẫn đang sống trên Community — Mermaid to FigJam,
Text to Flowchart, Mermaid-to-Flow, FigJam ↔ Mermaid Converter, Mermaid
Bridge. Tất cả đều sinh sơ đồ FigJam từ chữ.

Yếu, và đây là chỗ sẽ bị bẻ: **bản cập nhật không phải duyệt lại.** Figma
nói rõ, duyệt xong rồi thì mọi bản sau đăng thẳng. Nên "Text to Flowchart
cập nhật tháng 11/2025" **không** chứng minh chính sách hôm nay chấp nhận
nó — chỉ chứng minh nó được duyệt từ trước.

Thứ thực sự có sức nặng là một plugin **được duyệt lần đầu gần đây**.
`Mermaid Bridge` mang id `1636694696146016727`; plugin của bạn là
`1684119893123676733`. Id của Figma tăng dần theo thời gian, nên nó được
tạo **sau** `Text to Flowchart` (`1574…`) và không xa bạn bao nhiêu. Đó là
số liệu đáng nêu — nhưng nêu như một **câu hỏi**, không phải lời buộc tội,
vì ta suy ra từ thứ tự id chứ không có ngày duyệt thật.

**Đừng khai gian.** Giấu chức năng sinh sơ đồ, hay khai sai biểu mẫu bảo
mật, là thứ bị phát hiện ở lần cập nhật sau và mất cả quyền publish chứ
không chỉ một lần nộp. Lập luận trung thực dưới đây đủ mạnh, không cần.

## Đòn mạnh nhất: đổi câu hỏi

Đừng cãi "chúng tôi không trùng". Hãy hỏi **"trùng ở phần nào, và bỏ phần
đó đi thì được không?"** Kèm một đề nghị cụ thể.

Việc đó biến một lời từ chối cụt thành một cuộc thương lượng, và nó cho
người duyệt đường ra mà không phải tự nhận mình sai.

---

## Thư để gửi

> Subject: Re: Reqwise - diagrams for FigJam and Figma design (1684119893123676733)
>
> Thank you for the review and for the pointer to `use_figma` — that is
> genuinely useful direction.
>
> I would like to check one thing before revising, because I think the
> overlap may be narrower than the listing made it look. That is my fault:
> the listing led with diagram generation, which is the part that overlaps,
> and buried the part that does not.
>
> **What the plugin does that generation does not**
>
> The drawing is the cheap half. The half users keep it for is the review
> pass: it reads a diagram's model back and reports structural holes in it.
> Real examples from its output:
>
> - "Dead end — nothing leaves 'Card declined'. Add the next step, or mark
>   it terminal."
> - "No screenId on 'Pick number' — the reader cannot trace this box back
>   to an artboard."
> - "Use case 'Refund order' has no actor who can start it."
>
> These are findings about the *model*, not about the picture, and they are
> reported before anything is drawn. As far as I can tell `use_figma` and
> `generate_diagram` create diagrams; they do not audit an existing one and
> tell the author what the flow is missing. If that is wrong I would
> genuinely like to know, because then I should stop building it.
>
> **On the overlap itself**
>
> The plugin is the drawing end of a bridge for MCP clients that cannot
> reach Figma's own MCP server. It is not an alternative path for the same
> call — a user who can use `use_figma` has no reason to install this.
>
> **A concrete proposal**
>
> If diagram generation is the specific thing that cannot be approved, I
> will remove it from the Community build and ship review-only: the plugin
> reads a FigJam board the user drew by hand, runs the structural checks,
> and writes findings next to the shapes. No generation, no external
> service, no MCP client required. Would that be approvable? I would rather
> build the right thing once than resubmit and guess.
>
> **One question on consistency**
>
> Several plugins currently live on Community generate FigJam diagrams from
> text — Mermaid to FigJam, Text to Flowchart, Mermaid-to-Flow, FigJam ↔
> Mermaid Converter, Mermaid Bridge. I am not asking you to act on those; I
> am asking what distinguishes an approvable one from mine, so my revision
> aims at the right line. If the answer is simply that the policy changed
> after they were approved, that is a complete answer and I will plan
> around it.
>
> Thanks again for the time.

---

## Kỳ vọng thực tế

| Đường | Khả năng qua |
|---|---|
| Chỉ viết lại mô tả, giữ nguyên plugin | thấp — **~15%** |
| Thư trên, có kèm đề nghị bỏ phần sinh sơ đồ | **~40%** có phản hồi hữu ích hoặc lối ra |
| Nộp lại bản chỉ-soát, không backend | **cao** — hết trùng, hết backend, bấm là chạy |

Thư này đáng gửi kể cả khi bạn định làm bản chỉ-soát: câu trả lời của họ
cho biết nên xây cái gì, và mất một buổi chờ thay vì ba tiếng code sai
hướng.

## Không đổi

Công cụ nội bộ chạy bình thường. Bị từ chối chỉ đóng cửa Community, không
đụng tới relay, plugin dev-mode hay Cowork của nhóm.
