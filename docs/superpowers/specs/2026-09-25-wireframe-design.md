# Wireframe từ PRD + FigJam — thiết kế

Ngày: 25/09/2026 · Trạng thái: chờ duyệt spec · Dự án thử: Second Phone Number

## 1. Mục tiêu

PM có PRD (markdown) và một board FigJam (IA, flow, USM). Tool dựng **wireframe lo-fi** trên
một file Figma Design: mỗi màn là một hàng frame, **mỗi state một frame**, kèm panel ghi
**dữ liệu** của màn — đầu vào cho designer. PRD và board đổi theo từng phiên bản; mỗi lần có
bản mới, tool **sửa tại chỗ** những màn thay đổi, **không giữ bản cũ**, và **ghi log**.

Thành công khi: chạy trên Second Phone ra đủ màn của IA với state theo bảng 5.2; chạy lại với
một PRD đã sửa thì chỉ các màn đổi bị vẽ lại, id frame giữ nguyên, log liệt kê đúng thay đổi.

Ngoài phạm vi bản đầu: hi-fi / design system; nội dung MSG từ Google Sheet (chỉ hiện mã);
lọc MVP theo màu USM.

## 2. Nguồn đầu vào (đo trên Second Phone)

| Cần | Lấy từ | Ghi chú |
|---|---|---|
| Danh sách màn | IA trên board (node 799:3667, 52 màn, 10 khu) | PRD §0.3 gọi IA là nguồn duy nhất |
| Điều hướng | Flow (133 section): connector có id hai đầu, 393/901 có nhãn điều kiện; tag `START/SCREEN/END — <Màn>[ / <State>]` | tag không nối connector, ghép theo vị trí |
| State | PRD bảng 5.2 (5 loại, 51/51 tính năng) + hậu tố tag flow | có bảng chép nhầm (IV.3 ← IV.1) |
| Thành phần, dữ liệu | Văn xuôi Happy Case + AC; bảng mô tả màn trên board (Paywall, Onboarding) | LLM suy ra — độ tin cậy vừa |
| Thông báo | Mã `MSG-XXX-nn` (106 mã) | chữ thật ở Sheet ngoài — ngoài phạm vi |

Tên màn lệch giữa IA, tag flow và PRD ("Sign In"/"Login Screen", "Home"/"Home Screen") → cần alias.

## 3. Kiến trúc

Hai lớp, một file spec ở giữa.

1. **Skill `figma-wireframe`** (`.claude/skills/figma-wireframe/SKILL.md`) — phần LLM.
   Đọc PRD + board (theo từng section, IA trước), chạy prompt bóc tách (Phụ lục A), ghi
   `wireframe.spec.json` cạnh PRD, đưa `warnings` + `flags` cho PM duyệt, rồi gọi tool.
2. **`figma_diagram type:"wireframe"`** — phần tất định, không LLM. Là một type như persona,
   nên chạy được cả local lẫn relay Figjam-draw (relay không có `figma_write`).

File chạm tới, theo mẫu type `persona`:
`src/shared/wireframe/{types,check,layout,diff,index}.ts` · `src/server/wireframe.ts` ·
`src/plugin/handlers/wireframe.ts` + `handlers/registry.ts` · marker `reqwise.wireframe` trong
`src/plugin/diagram-mark.ts` + `DIAGRAM_MARKERS` · `src/shared/protocol.ts` ·
`src/server/validate.ts` · `src/server/tools.ts` (`runDiagramType` + schema) ·
`src/shared/model/{facts,check}.ts` · `src/server/docs-content/wireframe.md.ts` + `index.ts` ·
`relay/src/index.ts` · skill + `.claude/commands/figjam-*.md` nếu có lệnh tương ứng.

## 4. Spec một màn

```json
{
  "screenId": "home", "name": "Home", "aliases": ["Home Screen", "Home Empty"], "zone": "Tab Home",
  "elements": [
    { "id": "hdr",   "kind": "header", "text": "Số của tôi" },
    { "id": "cards", "kind": "list", "item": "numberCard", "count": 3 },
    { "id": "fab",   "kind": "button", "text": "Thêm số" },
    { "id": "tabs",  "kind": "tabbar", "items": ["Home", "Calls", "Messages", "Settings"] }
  ],
  "data": [
    { "field": "number.label",  "type": "text",  "example": "Công việc", "source": "PRD IV.3 AC 01" },
    { "field": "number.status", "type": "enum",  "example": "active | expiring | expired", "source": "PRD IV.3 §5.1" }
  ],
  "states": [
    { "kind": "default", "source": "PRD IV.3 §5.2" },
    { "kind": "loading", "change": [{ "el": "cards", "to": "skeleton" }], "source": "PRD IV.3 §5.2" },
    { "kind": "empty",   "change": [{ "el": "cards", "to": "emptyBlock", "text": "Chưa có số nào" }], "source": "node 264:1555" },
    { "kind": "error",   "change": [{ "el": "cards", "to": "errorBlock" }], "msg": ["MSG-NET-01"], "source": "PRD IV.3 §5.2" },
    { "kind": "default", "label": "Số sắp hết hạn", "change": [{ "el": "cards", "badge": "expiring" }], "source": "PRD IV.3 §5.1" }
  ],
  "nav":   [{ "from": "fab", "to": "number-search", "when": "còn slot" }],
  "refs":  { "prd": ["IV.3", "IV.4"], "flows": ["253:2215"] },
  "flags": ["PRD IV.3 bảng 5.2 trùng IV.1 — nghi chép nhầm"]
}
```

File: `{ source: {prd, board, readAt}, screens[], removed[], warnings[] }`.

Luật:
- `screenId` là slug tool gán từ tên IA, **ổn định qua phiên bản**. IA đổi tên → tên cũ vào
  `aliases`, id giữ nguyên.
- "X Empty" trên IA là state `empty` của X.
- State chỉ ghi phần khác default (`change`). `kind` ∈ 5 loại của PRD; trạng thái nghiệp vụ là
  `default` + `label`.
- `elements[].kind` ∈ `header, text, heading, button, input, list, card, image, toggle,
  tabbar, banner, sheet`. `change[].to` nhận thêm các khối state: `skeleton, emptyBlock,
  errorBlock`, và `disabled: true` trên một element.
- `flags`: `[Cần xác nhận]` và mâu thuẫn skill tìm thấy — vẽ lên canvas.

## 5. Vẽ lên canvas

```
Page "Wireframe"
├─ Section "<zone>"                               một section mỗi khu IA
│   └─ hàng "<screenId> · <name>"
│       [Default] [Loading] [Empty] [Error] [<label>…]   │ Panel: Dữ liệu · Điều hướng ·
│        390×844, tên "<screenId> · <name> / <State>"     │ MSG · Nguồn · ⚠ Flags
└─ Frame "Wireframe log"
```

- Khối xám cố định, không token/design system.
- Tên frame chứa `screenId` → `nameMatchesScreenId`, sitemap `coverage`, userflow `linkScreens`
  khớp không cần sửa.
- `nav` → prototype ON_CLICK → NAVIGATE giữa các frame Default.
- Mỗi hàng lưu spec của màn trong `pluginData` (marker `reqwise.wireframe`) + chữ ký `LAST_WRITE`.

## 6. Phát hiện (findings) — tất định

Trả như các type khác, là phát hiện về MODEL:
- màn thiếu state `error` hoặc `loading`;
- `nav.to` trỏ màn không có trong spec; `change.el` trỏ element không tồn tại;
- `data` / `states` thiếu `source`;
- `kind` element lạ (vẫn vẽ khối xám có nhãn);
- màn IA chưa có trong spec / ngược lại (dùng `checkCoverage` khi có sitemap cùng page).

## 7. Chạy lại khi có bản mới

1. Skill bóc tách lại, truyền spec cũ vào prompt để giữ id; ra spec mới.
2. Tool đọc spec cũ từ `pluginData` của page, diff theo `screenId`:
   **không đổi** → không động (sửa tay của designer ở đó còn nguyên);
   **đổi** → vẽ lại cả hàng bằng `update` (giữ id frame), state thêm/bớt thì thêm/xoá frame;
   **mới** → thêm vào section đúng khu; **bỏ** (`removed[]`) → xoá.
3. **`dryRun` bắt buộc trước**: trả kế hoạch diff; skill cho PM xem, PM đồng ý mới áp.
4. **Chốt xoá hàng loạt**: >30% màn bị xoá → từ chối trừ khi `confirmRemove: true`.
5. Màn phải vẽ lại mà đã sửa tay (chữ ký `LAST_WRITE` khác) → vẫn ghi đè, log đánh ⚠.

Diff so sánh sâu từng màn trên các trường `elements, data, states, nav, flags, zone, name`;
`refs` và `source` đổi một mình không tính là thay đổi phải vẽ lại (chỉ ghi log).

## 8. Log

Frame "Wireframe log" trên page, mới nhất trên cùng:

```
25/09/2026 14:02 · PRD_MASTER_SecondPhone_v6.md · board đọc 13:58
+2 màn · −1 màn · ~5 màn sửa · 47 giữ nguyên · 9 flags
+ number-transfer (Tab Home)
− legacy-promo — IA không còn màn này
~ home: +state "Số sắp hết hạn"; data number.status: ví dụ đổi; nav fab→number-search: thêm "còn slot"
~ paywall ⚠ ghi đè sửa tay
```

Do code sinh từ diff, không do LLM. Đồng thời lưu trong `pluginData` của frame log và trả về
trong kết quả tool. Không giữ bản cũ nên log là lịch sử.

## 9. Lỗi

- Plugin chưa nối → `figma_status` và các gợi ý sẵn có.
- ~52 màn × ~5 state ≈ 260 frame → vẽ theo từng section qua batch `diagrams[]`. Hỏng giữa
  chừng: màn đã vẽ đã có spec trong frame, chạy lại chỉ vẽ phần thiếu (idempotent).
- Board lớn (~632K ký tự khi đọc cả trang) → skill đọc theo section.
- Node PRD trỏ tới đã bị xoá → warning `DEAD_LINK`, đi tiếp.

## 10. Test

- Vitest, phần thuần: `diff` (thêm/bớt/sửa/đổi tên qua alias/state thêm-bớt/`refs`-only),
  findings §6, layout (toạ độ; tên frame khớp `nameMatchesScreenId`), chốt 30%.
- Thêm mục vào các bộ sẵn có: `tool-schema`, `docs-sections`, `skills-claims`, `marker-list`,
  `diagram-spec-keys`, `new-diagram-checks`.
- End-to-end Second Phone: 3 màn (Splash, Sign In, Home) → đủ IA → sửa một bản sao PRD giả lập
  phiên bản mới, chạy lại, kiểm log và id frame.

## Phụ lục A — prompt bóc tách (dùng trong skill)

```
You turn a PRD and a FigJam board into `wireframe.spec.json`: the list of screens a lo-fi
wireframe needs, each with its elements, data, states and navigation. You are an extractor,
not a designer — everything you write must be traceable to the sources.

## Inputs
- PRD (markdown). One H2 per feature, each with: 1 Description + User Story, 1b Related
  features, 2 Flow (links to board node-ids), 3 Happy Case, 4 Acceptance Criteria, 5.1 business
  states, 5.2 screen-state table (Default/Loading/Empty/Error/Disabled × Screen × Shows × Message
  code), 6 Edge Cases.
- FigJam board. An IA section (the screens, grouped by zone). Flow sections: shapes + connectors
  (connector labels are conditions). Frame tags above flow nodes: `START|SCREEN|END — <Screen>[ / <State>]`.
- Previous spec (optional). Present on every run after the first.

## Procedure — in this order
1. Screen list from the IA only. One entry per IA screen, `zone` = its IA group.
   "X Empty", "X / Failed" and the like are STATES of X, not screens.
2. Ids. If a previous spec exists, match each screen to it by name, then by alias, and reuse
   its `screenId`. Mint a new kebab-case slug only for a screen with no match.
3. Aliases. Collect every screen name used in flow tags and in the PRD; attach each to the IA
   screen it means. A name you cannot attach goes to `warnings` (code UNMAPPED_NAME), never
   becomes a screen. Generic tags ("Màn trước", "Màn đang mở") are not names: resolve them to
   the screen the flow came from, or warn.
4. Per feature, fold into screens. For each PRD feature, find the screens it touches (5.2
   "Screen" column, Happy Case, its flows' tags) and add:
   - states from 5.2. A cell "A → B" is a transition: attach the state to the screen named
     first unless the "Shows" text is clearly about B. "—" means not applicable: emit nothing.
   - message codes from 5.2 and AC into `states[].msg`.
   - elements and data fields named in Happy Case and AC. Bold labels (`**Continue**/Tiếp tục`)
     are button texts. Do not add generic UI the text does not mention.
   - nav from flow connectors whose ends are tagged with two different screens; connector
     label → `when`.
   A screen touched by several features merges them; the same state kind twice becomes one
   entry with a `label` per variant only if the "Shows" text differs.
5. Cross-check, then flag. Add to `flags` of the screen (or `warnings` if screen-less):
   - 5.2 rows naming screens that none of this feature's flows visit (STATE_TABLE_MISMATCH —
     the table may have been copied from another feature);
   - a 5.2 table without exactly five rows; "Không áp dụng" used instead of "—";
   - every "[Cần xác nhận]" item, quoted;
   - two statements in the PRD that contradict each other, both quoted.
6. Removed screens. A previous-spec screen with no IA entry now goes to `removed[]`
   `{screenId, reason}`. Never drop one silently.

## Hard rules
- Every `data[]` entry and every `states[]` entry has `source` (e.g. "PRD IV.3 AC 02",
  "node 253:2215"). No source → leave it out and warn (NO_SOURCE).
- Never write user-facing copy that is not in the sources. Messages are codes (MSG-XXX-nn).
- `states[].kind` ∈ default | loading | empty | error | disabled. A business state is
  `default` + `label`.
- `elements[].kind` ∈ header, text, heading, button, input, list, card, image, toggle, tabbar,
  banner, sheet. Anything else → the closest kind + a flag.
- Skip flows marked "[NGOÀI MVP]". Flow codes repeat across features: identify flows by node id.
- A link to a node that no longer exists → warning (DEAD_LINK), keep going.

## Before you answer — self-check
- Every IA screen appears exactly once in `screens` (or you warned why not).
- Every `nav[].to` and `change[].el` points at something that exists.
- Every previous `screenId` is either in `screens` or in `removed`.

## Output
Only valid JSON, no comments, no prose:
{ "source": {prd, board, readAt}, "screens": [...], "removed": [...],
  "warnings": [{code, screenId?, where, message}] }
```
