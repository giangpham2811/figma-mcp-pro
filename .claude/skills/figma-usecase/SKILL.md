---
name: figma-usecase
description: Draw a UML use case diagram on Figma — what the system does, and for whom, inside a system boundary. Reach for it when scope is the argument, before anybody estimates anything.
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_docs, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_write
user-invocable: true
argument-hint: "<system or release> [source file or @tag]"
---

# /figma-usecase — What is in scope, and who it is for

Read `../reqwise-diagram-rules.md` first — connection gate, the four levels of correct, the
findings loop, frame placement, verification. This file carries only what is specific to a
use case diagram.

## Goal

Settle the scope argument by making it visible. Everything inside the boundary is what is
being built; everything outside it is who it is being built for. A backlog can hide scope
creep for a quarter; a rectangle on a wall cannot hide it for a meeting.

Output: one Figma frame `Use case · <title>`, plus the scope questions the boundary exposed —
which goals nobody can start, which actors do nothing, and which of the "requirements" turned
out to be steps rather than goals.

## Constraints

### Hard rules — never violate

- **A use case is a GOAL, not a step.** "Chia tiền bữa ăn" is a use case. "Màn hình chia
  tiền" is a screen, "Bấm nút Lưu" is a step, and both are feature lists wearing UML. If it
  does not finish with the actor having achieved something they came for, it is not one.
- **No ordering.** There is no `edges` array and there is no "first this, then that". A use
  case diagram says *what*, never *when*. If you want a sequence, that is `/figma-activity`
  or `/figma-sequence`.
- **`extends` goes on the EXTENSION, not the base.** `extends: ["chia"]` on `nhac` means
  "nhắc sometimes extends chia". The base does not know its extensions exist. This is the
  single most common error in hand-drawn use case diagrams, and the tool draws what you write
  rather than quietly correcting it.
- **`includes` means ALWAYS.** If it only sometimes happens, it is `extends`. If it is
  neither, it is probably two unrelated use cases.
- **An actor is a ROLE, not a person.** "Người chia tiền", never "Lan". Lan belongs in
  `/figma-persona`.
- **Never draw a line between two actors.** The tool drops it and says why: a plain line
  between actors means nothing in UML, and a drawn line is a claim.

### Write it in the compact form

`text` instead of `actors`/`useCases`, at roughly a third of the tokens:

```
actor nguoi_chia "Người chia tiền"  primary
actor thanh_vien "Thành viên nhóm"  primary
actor ngan_hang  "Ngân hàng"        system

uc chia "Chia tiền bữa ăn"
  by: nguoi_chia
  includes: tinh_no
  detail: Chia đều hoặc theo phần
uc tinh_no "Tính ai nợ ai"
uc nhac "Nhắc người chưa trả"
  by: nguoi_chia
  extends: chia
uc xem_no "Xem mình nợ bao nhiêu"
  by: thanh_vien
uc doi_soat "Đối soát với sao kê"
  by: ngan_hang
```

Line grammar: `actor <id> ["Label"] [primary|secondary|system]`, then `uc <id> ["Label"]`
with indented `by:` / `includes:` / `extends:` / `detail:` / `screen:` lines.

An `actor` line **ends** the previous use case block, so a `by:` written after one is
reported rather than silently attached to the wrong use case. A line that is not understood
is reported, never dropped.

### The scope table — read this before writing a line

| Want to say | Write | NOT |
|---|---|---|
| The user splits a bill | `uc chia "Chia tiền bữa ăn"` | `uc man_hinh_chia "Màn hình chia tiền"` — a screen |
| Splitting always computes debts | `includes: tinh_no` on `chia` | a second use case in sequence |
| Reminding sometimes follows splitting | `extends: chia` on `nhac` | `includes` on `chia` — that would make it always |
| The bank is involved | `actor ngan_hang ... system` | a use case called "Ngân hàng" |
| Lan is our main user | `/figma-persona` | an actor called "Lan" |
| After splitting, the user sees a summary | `/figma-userflow` | an arrow between two ovals |

## Inputs

```
/figma-usecase "Vuông v1"                      # interview from scratch
/figma-usecase "Vuông v1" @docs/srs/spec.md    # derive from a source, ask only the gaps
/figma-usecase                                 # asks which system or release
```

## Approach

### Phase 0 — Connection

Per shared rules §5.

### Phase 1 — Read what the page already knows

```
figma_read op:"get_page_model"
```

A `Persona · ` frame there names the roles somebody already decided exist — those are
candidate actors, and using the same ids is what lets the two artefacts be read together.

### Phase 2 — Derive the model

Build the fact-list you will check the drawing against:

1. **Every goal the source names**, phrased as something achieved.
2. **Who initiates each one**, and who the system calls on to finish it.
3. **Which "requirements" are actually steps** of a goal already on the list.
4. **What is explicitly out of scope** — this is the half a source never states, and the
   reason the boundary is worth drawing.

Anything the source does not say, **ask**, in the user's language: *ai là người bắt đầu việc
này?* · *cái này luôn xảy ra, hay chỉ đôi khi?* · *cái này nằm trong bản này hay để sau?*

### Phase 3 — Check, then draw, in one call

Call `figma_diagram` with `type: "usecase"` and `options: { checkFirst: true }` — it checks
first and draws only if there are no findings. Read every warning; the ones specific to this
kind are in `figma_docs(section="usecase")`.

Then read `audit` from the same result — the render-side check (overflow, clipping,
truncation). Fix anything it reports; no second call for it.

### Phase 4 — Report

Per shared rules §11, plus the two things only you can say: which goals came from the source
versus from an answer in the interview, and **what you deliberately left outside the
boundary**. The second list is the one worth reading aloud, because it is the one nobody
writes down and everybody assumes differently.

To change one later, patch rather than redraw:

```
figma_diagram({ update: "140:5914", patch: [
  { collection: "useCases", id: "nhac", set: { extends: ["chia"] } },
] })
```

## What the machine does NOT check

- whether these are the right use cases, or whether the boundary is in the right place. That
  is the argument; the diagram only makes it visible;
- whether a label is a goal or a screen name. "Màn hình X" passes every check;
- whether `includes` is really *always*. The difference between `includes` and `extends` is a
  judgement about the business, not a shape a checker can see;
- whether an actor is a role or a person — "Lan" passes, and it should be "Người chia tiền";
- whether anything outside the boundary was left out on purpose or forgotten. Only you know
  which, and it is the finding that costs the most when it is wrong.
