---
name: figma-journey
description: Draw a customer journey map on Figma — what a person does across a whole experience, where the product meets them, and how it feels at each stage. Reach for it when the product is technically fine and people still dislike using it.
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_docs, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_write
user-invocable: true
argument-hint: "<experience> [persona id] [source file or @tag]"
---

# /figma-journey — What it is actually like

Read `../reqwise-diagram-rules.md` first — connection gate, the four levels of correct, the
findings loop, frame placement, verification. This file carries only what is specific to a
journey map.

## Goal

Find the moment where every screen works and the experience still fails. That moment is
almost never inside the product: it is the wait, the second phone call, the part the person
does in a spreadsheet because nobody built it.

Output: one Figma frame `Journey · <title>`, plus the two lists the map exists to produce —
the stages nothing serves, and the low point with what to do about it.

## Constraints

### Hard rules — never violate

- **A stage is a PHASE OF INTENT, not a screen.** "Hỏi đồng nghiệp xem có đáng làm không" is
  a stage. It has no screen, it happens nowhere near the product, and leaving it off is how a
  journey map becomes a userflow with feelings drawn on it.
- **Stages in the person's words.** "Chờ mọi người trả tiền", not "Trạng thái PENDING".
- **A stage with no touchpoint is a FINDING, not an error.** Do not invent a touchpoint to
  make the row look full. The empty cell is the point — it draws as a dash so it is visible
  on the wall, not only in the warnings.
- **`feeling` is `-2..2`, whole steps.** Research gives you "frustrated" and "relieved", not
  7.4. A finer scale invents precision nobody measured.
- **Never make the curve pretty.** A journey that dips once in the middle and recovers is the
  shape everybody draws and almost nobody measures. If the research says it is bad at the end
  and stays bad, draw that.
- **No arrows, no ordering beyond the array.** There is no `edges` array. If you want screen
  transitions, that is `/figma-userflow`.

### Write it in the compact form

`text` instead of `stages`, at roughly a third of the tokens:

```
stage an "Ăn xong, ai đó trả tiền"  feeling: 1
  does: Một người quẹt thẻ cho cả nhóm
  touch: Hoá đơn giấy
  thinks: Lát nữa tính sau

stage chia "Chia tiền"  feeling: -1
  does: Chụp ảnh hoá đơn
  does: Nhẩm chia theo đầu người
  pain: Không nhớ ai đã chuyển khoản
  opp: Đối soát tự động khi số dư thay đổi
  screen: 01,02

stage doi "Chờ mọi người trả"  feeling: -2
  does: Nhắn nhóm lần thứ ba
  pain: Nhắc nợ bạn bè là việc khó xử
  opp: Nhắc tự động, không cần ai mở lời
```

Line grammar: `stage <id> ["Label"] [feeling: n]`, then indented `does:` / `touch:` /
`thinks:` / `pain:` / `opp:` / `screen:` lines, one item per line.

`feeling` also takes words — `frustrated`, `neutral`, `delighted` — because that is what a
research note says. A line that is not understood is reported, never dropped.

### The stage table — read this before writing a line

| Want to say | Write | NOT |
|---|---|---|
| They wait for other people to pay | `stage doi "Chờ mọi người trả"` | a screen name — waiting has no screen |
| Nothing serves them while they wait | leave `touch:` empty | invent "email nhắc nợ" that does not exist |
| It is the worst moment | `feeling: -2` | `-1` because the curve looks nicer |
| We could fix it by auto-reconciling | `opp: Đối soát tự động…` | leaving the opportunity column empty |
| They then open the app | `touch: Ứng dụng` | a new stage — opening the app is not a phase of intent |
| Which screens cover this stage | `screen: 01,02` | nothing, which costs the coverage cross-check its match |

## Inputs

```
/figma-journey "Chia tiền sau chuyến đi"                 # interview from scratch
/figma-journey "Chia tiền" lan @research/interviews.md   # from research, for persona `lan`
/figma-journey                                           # asks which experience
```

## Approach

### Phase 0 — Connection

Per shared rules §5.

### Phase 1 — Read what the page already knows

```
figma_read op:"get_page_model"
```

A `Persona · ` frame names who this journey is for — pass its id as `persona` so the two
artefacts join up. A `Userflow · ` frame names the screens, which are candidates for
`touchpoints` — but only for the stages that happen inside the product.

### Phase 2 — Derive the model, and be honest about the source

Build the fact-list, and for each stage note **where it came from**: an interview, an
analytics drop-off, or your own assumption. You will report that split in Phase 4, and it is
the most useful sentence in the whole exercise.

Anything the source does not say, **ask**: *lúc đó họ làm gì?* · *có ai/cái gì giúp họ ở
bước này không?* · *bước nào khó chịu nhất?* · *họ có bỏ cuộc ở đâu không?*

### Phase 3 — Check, then draw, in one call

Call `figma_diagram` with `type: "journey"` and `options: { checkFirst: true }` — it checks
first and draws only if there are no findings. The warnings specific to this kind are in
`figma_docs(section="journey")`; the one worth taking seriously is the flat emotion track,
which means the column was filled in rather than researched.

Then read `audit` from the same result and fix anything it reports.

### Phase 4 — Report

Per shared rules §11, plus:

- **which stages came from research and which from assumption** — nobody else can say this,
  and a map read as evidence when half of it is guesswork is worse than no map;
- **the low point, and the one opportunity you would do first.** A journey map that ends
  without a recommendation gets admired and filed.

To change a stage later, patch rather than redraw:

```
figma_diagram({ update: "140:5914", patch: [
  { collection: "stages", id: "doi", set: { feeling: -1 } },
] })
```

## What the machine does NOT check

- whether the stages are the **real** phases. A plausible five-stage arc can be entirely
  invented and every check will pass;
- whether the feelings were measured. It can see a flat track; it cannot see a fabricated
  curve;
- whether the opportunities are any good — only that they exist;
- whether the map covers the part that matters. A happy path with one token low point is the
  commonest way this artefact flatters the team that drew it;
- whether the persona this is drawn for is the one whose journey matters.
