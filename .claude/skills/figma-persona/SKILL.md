---
name: figma-persona
description: Draw a persona set on Figma — who the product is for, what they are trying to get done, and what stops them today. Reach for it before a prioritisation argument, not after.
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_docs, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_write
user-invocable: true
argument-hint: "<product or audience> [source file or @tag]"
---

# /figma-persona — Who this is for

Read `../reqwise-diagram-rules.md` first — connection gate, the four levels of correct, the
findings loop, frame placement, verification. This file carries only what is specific to a
persona set.

## Goal

Produce something a team can settle an argument with. "Should we build the bulk importer or
the reminder?" is answerable if one card says what the primary user is trying to get done and
what currently stops them. It is not answerable by an age and a stock photo.

Output: one Figma frame `Persona · <title>`, plus the honest split between what came from
research and what came from assumption.

## Constraints

### Hard rules — never violate

- **Behavioural, not demographic.** `goals` and `frustrations` are the load-bearing fields.
  Age, city and team size go in `demographics`, are drawn last and smallest, and a card made
  only of them is reported. This is Cooper's complaint made checkable.
- **Never invent a quote.** A `quote` is drawn large and in the person's voice, and everyone
  who sees the wall reads it as evidence. If you do not have a verbatim line from research,
  leave it out. A paraphrase looks identical to a real quote here, and that is exactly why
  this rule is absolute.
- **Never generate a photo.** The avatar is initials on a coloured disc. A stock headshot
  makes a persona feel researched when it is not.
- **One primary.** Designing for two produces a product that fits neither. If the research
  genuinely has two, that is a finding to discuss, not a thing to smooth over.
- **Name the negative personas.** `role: "negative"` is who this is explicitly NOT for. It is
  the field teams never fill in, and the one that stops a backlog drifting towards whoever
  shouts loudest.
- **An actor is not a persona.** "Người chia tiền" is a role and belongs in
  `/figma-usecase`; "Lan, kế toán trưởng, chốt sổ vào tối chủ nhật" is a persona.

### Write it in the compact form

`text` instead of `personas`, at roughly a third of the tokens:

```
persona lan "Lan" | Kế toán trưởng | primary
  quote: Tôi chỉ muốn biết cuối tháng ai còn nợ ai.
  goal: Chốt sổ nhóm trong một buổi tối
  goal: Không phải nhắc nợ bằng tay
  pain: Mỗi người gửi một kiểu ảnh chụp hoá đơn
  pain: Nhắc bạn bè trả tiền là việc khó xử
  does: Gõ lại số tiền vào Excel của riêng mình
  tool: Excel, Zalo
  about: Tuổi = 34
  scenario: Cuối tháng, sau giờ làm, trên điện thoại
  screen: 01,02

persona minh "Minh" | Thành viên nhóm | secondary
  goal: Biết mình nợ bao nhiêu mà không phải hỏi
  pain: Không nhớ đã chuyển khoản chưa

persona ke_toan_cty "Kế toán công ty" | | negative
  about: Ghi chú = Cần hoá đơn VAT và phân quyền — ngoài phạm vi bản này
```

Line grammar: `persona <id> ["Name"] [| Title] [| role]`, then indented `field: value` lines.
`goal` / `pain` / `does` repeat, one item per line. `tool` splits on commas because a list on
one line is how people write tools. A line that is not understood is reported, never dropped.

### The persona table — read this before writing a card

| Want to say | Write | NOT |
|---|---|---|
| She wants to close the books quickly | `goal: Chốt sổ nhóm trong một buổi tối` | `about: Bận rộn` — an adjective settles nothing |
| Today she retypes numbers into Excel | `does: Gõ lại số tiền vào Excel` | `tool: Excel` alone, which hides the workaround |
| We are not building for company accountants | `persona … | | negative` | leaving them off, so somebody adds VAT next quarter |
| She said this in interview 3 | `quote: …` verbatim | a plausible sentence you wrote |
| She is 34 | `about: Tuổi = 34` | the first line of the card |
| Her role in the system | `/figma-usecase` actor | a persona per role, which multiplies the set |

## Inputs

```
/figma-persona "Vuông"                             # interview from scratch
/figma-persona "Vuông" @research/interviews.md     # synthesise from research
/figma-persona                                     # asks which product or audience
```

## Approach

### Phase 0 — Connection

Per shared rules §5.

### Phase 1 — Read what the page already knows

```
figma_read op:"get_page_model"
```

A `Use case · ` frame names the actors somebody already decided exist. Actors are roles, not
personas — but they tell you how many distinct kinds of people the system assumes, which is
a good check on how many cards you are about to draw.

### Phase 2 — Derive, and track the provenance

For each field, note whether it came from research or from assumption. You will report that
split in Phase 4 and it is the most useful sentence in the exercise — a persona set read as
evidence when half of it is guesswork does more damage than none at all.

Ask what the source does not say: *họ đang làm việc này bằng cách nào?* · *cái gì làm họ mất
thời gian nhất?* · *nếu chỉ sửa được một thứ, họ chọn gì?* · *ai KHÔNG phải người dùng của
bản này?*

### Phase 3 — Check, then draw, in one call

Call `figma_diagram` with `type: "persona"` and `options: { checkFirst: true }` — it checks
first and draws only if there are no findings. The warnings specific to this kind are in
`figma_docs(section="persona")`; the one that catches real mistakes is two personas whose
goals overlap heavily, which means one person with two job titles.

Then read `audit` from the same result and fix anything it reports.

### Phase 4 — Report

Per shared rules §11, plus:

- **which fields came from research and which from assumption**;
- **who you left out, and why.** If there is no negative persona on the wall, say so — an
  empty answer there is itself the finding.

To change a card later, patch rather than redraw:

```
figma_diagram({ update: "140:5914", patch: [
  { collection: "personas", id: "minh", set: { role: "primary" } },
] })
```

## What the machine does NOT check

- whether these people are **real**. It sees whether a card is shaped like a persona, not
  whether anybody was interviewed;
- whether a quote is verbatim. A paraphrase passes every check and reads as evidence;
- whether the goals are the ones that matter to the business;
- whether `role: "primary"` is on the right card. It checks that exactly one exists, not that
  it is the right one;
- whether the set is missing a whole kind of person. Nothing can tell you about the user you
  never met.
