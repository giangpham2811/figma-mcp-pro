export const PERSONA = `# Persona — figma_diagram type:"persona"

WHO this is being built for, in a form a team can argue with. The other kinds
describe the product; this one describes the person the product is right or
wrong for.

**The one thing to get right about this kind:** a persona is a **behavioural**
model, not a demographic one. An age, a city and a stock photo settle no
argument. What this person is trying to get done, and what stops them today,
settle several — so \`goals\` and \`frustrations\` are the load-bearing fields
and the checker reports a card without them.

Pick the diagram by the question:

| question | tool |
| --- | --- |
| who is this for, and what do they want | \`figma_diagram\` type:"persona" |
| what do they do over time, and how does it feel | \`figma_diagram\` type:"journey" |
| what does the system do for them | \`figma_diagram\` type:"usecase" |
| what screens do they move through | \`figma_diagram\` type:"userflow" |

## Shape

\`\`\`jsonc
{
  "type": "persona",
  "title": "Ai dùng Vuông",
  "personas": [
    {
      "id": "lan",
      "name": "Lan",
      "title": "Kế toán trưởng",
      "role": "primary",           // primary | secondary | served | negative
      "quote": "Tôi chỉ muốn biết cuối tháng ai còn nợ ai.",
      "goals": ["Chốt sổ trong một buổi tối"],
      "frustrations": ["Mỗi người gửi một kiểu ảnh hoá đơn"],
      "behaviours": ["Gõ lại số tiền vào Excel của riêng mình"],
      "tools": ["Excel", "Zalo"],
      "demographics": { "Tuổi": 34 },
      "scenario": "Cuối tháng, sau giờ làm, trên điện thoại",
      "screenId": ["01", "02"]
    }
  ],
  "options": { "columns": 3 }
}
\`\`\`

## The roles, and why they are not decoration

| role | meaning | drawn |
| --- | --- | --- |
| \`primary\` | the one the product is designed for | blue |
| \`secondary\` | accommodated, never at the primary's expense | teal |
| \`served\` | affected without using it — the payee on an invoice | violet |
| \`negative\` | explicitly NOT built for | red |

**Ideally exactly one primary.** Designing for two produces a product that
fits neither, which is the whole reason the role exists — and the checker
says so when it finds two.

**Name the negative personas.** They are what stops a backlog drifting
towards whoever shouts loudest, and they are the ones teams never write down.

## The compact form

\`text\` instead of \`personas\`, at roughly a third of the tokens:

\`\`\`
persona lan "Lan Nguyễn" | Kế toán trưởng | primary
  quote: Tôi chỉ muốn biết cuối tháng ai còn nợ ai.
  goal: Chốt sổ trong một buổi tối
  pain: Mỗi người gửi một kiểu ảnh chụp hoá đơn
  does: Gõ lại số tiền vào Excel của riêng mình
  tool: Excel, Zalo
  about: Tuổi = 34
  scenario: Cuối tháng, sau giờ làm
\`\`\`

Line grammar: \`persona <id> ["Name"] [| Title] [| role]\`, then indented
\`field: value\` lines. \`goal\`/\`pain\`/\`does\` repeat, one per line;
\`tool\` splits on commas because a list on one line is how people write tools.
A line that is not understood is **reported**, never dropped.

## What the checker reports

| finding | what it usually means |
| --- | --- |
| no goals and no frustrations | a portrait, not a persona — it can settle no argument |
| N demographic fields and no behaviour | a marketing segment wearing a face |
| two personas want N% the same things | one person with two job titles; the product gets two backlogs for one need |
| none marked primary | every trade-off gets decided by whoever is in the room |
| N marked primary | designing for two primaries fits neither |
| more than five personas | past five nobody recalls them in planning, and the set stops being used |

## What the machine does NOT check

- whether these people are **real**. The checker cannot tell a researched
  persona from an invented one — only whether the card is shaped like one;
- whether the goals are the ones that matter to the business;
- whether \`role: "primary"\` is the right choice. It checks that exactly one
  exists, not that it is the right one;
- whether a quote is verbatim. A paraphrase looks identical to research here,
  and reads as evidence to everyone who sees the wall.
`;
