export const USECASE = `# Use case — figma_diagram type:"usecase"

What the system does FOR someone, and who that someone is. The artefact that
settles a scope argument, because everything inside the boundary is what is
being built and everything outside it is who it is being built for.

**The one thing to get right about this kind:** a use case is a **goal**, not
a step. "Chia tiền bữa ăn" is a use case. "Màn hình chia tiền" is a screen,
and a use case named after a screen is a feature list wearing UML.

There is no ordering between use cases and **no edges array**. The only
relationships UML defines between them are the two below.

| relation | meaning | direction |
| --- | --- | --- |
| \`includes\` | A ALWAYS does B as part of itself | base → included |
| \`extends\` | B SOMETIMES adds itself to A | **extension → base** |

\`extends\` goes on the extension, not the base: the base does not know its
extensions exist. Getting that backwards is the commonest error in hand-drawn
use case diagrams, and the tool draws what you write rather than correcting
it.

## Shape

\`\`\`jsonc
{
  "type": "usecase",
  "spec": {
    "title": "Vuông",
    "actors": [
      { "id": "nguoi_chia", "label": "Người chia tiền", "kind": "primary" },
      { "id": "ngan_hang", "label": "Ngân hàng", "kind": "system" }
    ],
    "useCases": [
      { "id": "chia", "label": "Chia tiền bữa ăn", "actors": ["nguoi_chia"], "includes": ["tinh_no"] },
      { "id": "tinh_no", "label": "Tính ai nợ ai" },
      { "id": "nhac", "label": "Nhắc người chưa trả", "actors": ["nguoi_chia"], "extends": ["chia"] }
    ],
    "options": { "system": "Vuông", "perColumn": 6 }
  }
}
\`\`\`

## The actor kinds

| kind | who | drawn |
| --- | --- | --- |
| \`primary\` | initiates a use case for a goal of their own | stick figure, LEFT |
| \`secondary\` | the system calls on them — a gateway, an approver | stick figure, right |
| \`system\` | another system, not a person | **box**, right |

A system actor is a box rather than a stick figure on purpose: a stick figure
for "Ngân hàng" invites people to think a human is involved.

## The compact form

\`text\` instead of \`actors\`/\`useCases\`:

\`\`\`
actor nguoi_chia "Người chia tiền"  primary
actor ngan_hang  "Ngân hàng"        system

uc chia "Chia tiền bữa ăn"
  by: nguoi_chia
  includes: tinh_no
uc tinh_no "Tính ai nợ ai"
uc nhac "Nhắc người chưa trả"
  by: nguoi_chia
  extends: chia
\`\`\`

\`by:\` rather than \`actors:\` because it reads as the sentence the diagram
makes. An \`actor\` line ends the previous use case block, so a \`by:\` after
one is reported rather than attached to the wrong thing.

## What the checker reports — and the one thing it DROPS

| finding | what it usually means |
| --- | --- |
| use case has no actor and nothing includes it | nobody can start it: out of scope, or an actor is missing |
| actor takes part in no use case | out of scope, or what they do is not written down |
| lists "x" as an actor, but x is a USE CASE | you meant \`includes\` or \`extends\` |
| include cycle | each always performs the next, so none can finish |
| actors but no use cases | who is around the system, and nothing about what it does |

**A link between two actors is dropped, not drawn.** A plain line between two
actors means nothing in UML, and a drawn line is a claim — so the diagram
would be asserting a relationship that does not exist. A warning beside a
lying picture is still a lying picture, and the picture is what gets
screenshotted into the spec.

A use case reached only by \`include\` is legitimately actorless: its actor is
whoever started the including use case, and the checker is silent about it.

Orphans are drawn in **amber, dashed**, because the point of the boundary is
to argue about it on a wall — a finding that exists only in a warnings array
does not get argued about.

## What the machine does NOT check

- whether these are the right use cases, or whether the boundary is in the
  right place. That is the argument; the diagram only makes it visible;
- whether a label is a goal or a screen name. "Màn hình X" passes every check;
- whether \`includes\` is really always, or just usually — the difference
  between \`includes\` and \`extends\` is a judgement about the business;
- whether an actor is a role or a person. "Lan" as an actor passes, and it
  should be "Người chia tiền".
`;
