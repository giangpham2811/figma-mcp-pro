export const JOURNEY = `# Journey map — figma_diagram type:"journey"

What a person DOES over time, and how it feels. The artefact that finds the
moment where the product is technically fine and the experience is not.

**The one thing to get right about this kind:** a journey stage is a **phase
of intent**, not a screen. "Hỏi đồng nghiệp xem có đáng làm không" is a
stage; it has no screen and it belongs on the map. Model it as screens and
you have drawn a second, worse userflow.

| relation | meaning | tool |
| --- | --- | --- |
| stage follows stage | the person's experience over time | \`type:"journey"\` |
| screen → screen | the product's geography | \`type:"userflow"\` |

So there is **no edges array**. Stages are ordered by their position in the
array and nothing else.

## Shape

\`\`\`jsonc
{
  "type": "journey",
  "title": "Chia tiền sau chuyến đi",
  "persona": "lan",                 // the persona id, so the two join up
  "stages": [
    {
      "id": "an",
      "label": "Ăn xong, ai đó trả tiền",
      "doing": ["Một người quẹt thẻ cho cả nhóm"],
      "touchpoints": ["Hoá đơn giấy"],
      "thinking": ["Lát nữa tính sau"],
      "feeling": 1,                 // -2..2, whole steps only
      "pains": [],
      "opportunities": [],
      "screenId": ["01"]
    },
    {
      "id": "chia",
      "label": "Chia tiền",
      "doing": ["Chụp ảnh hoá đơn", "Nhẩm chia theo đầu người"],
      "touchpoints": [],            // nobody serves this — the finding
      "feeling": -1,
      "pains": ["Không nhớ ai đã chuyển khoản"],
      "opportunities": ["Đối soát tự động khi số dư thay đổi"]
    }
  ],
  "options": { "columnWidth": 220, "emotionCurve": true }
}
\`\`\`

## The emotion scale

\`-2\` despairing · \`-1\` annoyed · \`0\` neutral · \`1\` pleased · \`2\` delighted.

Five whole steps on purpose. Research gives you "frustrated" and "relieved",
not 7.4, and a finer scale invites precision the checker cannot tell from
invention.

## The compact form

\`text\` instead of \`stages\`:

\`\`\`
stage an "Ăn xong, ai đó trả tiền"  feeling: 1
  does: Một người quẹt thẻ cho cả nhóm
  touch: Hoá đơn giấy
  thinks: Lát nữa tính sau
stage chia "Chia tiền"  feeling: -1
  does: Chụp ảnh hoá đơn
  pain: Không nhớ ai đã chuyển khoản
  opp: Đối soát tự động khi số dư thay đổi
\`\`\`

\`feeling\` rides on the stage line because it is one token and belongs with
the stage. It also takes words: \`feeling: frustrated\`, \`feeling: delighted\`.
A line that is not understood is **reported**, never dropped.

## What the checker reports

| finding | what it usually means |
| --- | --- |
| N stages have no touchpoint | either the person is on their own there — worth stating deliberately — or the product has a gap exactly where they need it |
| N pain points and no opportunities | a complaint, not a map. The opportunity column is what a team can act on |
| every stage has the same feeling | the column was filled in, not researched — and a flat journey tells nobody where to start |
| no stage feels negative | the demo path, not the experience |
| stage lists a pain but feels positive | one of the two columns is guessed |
| the low point names no pain | what happens there? |

An empty cell is drawn as a faint dash, not left blank. A blank cell reads as
"not filled in yet"; a dash reads as "nothing here", which is the finding.

## What the machine does NOT check

- whether the stages are the **real** phases. A plausible five-stage arc can
  be entirely invented and every check will pass;
- whether the feelings are measured. It can see a flat track, not a fabricated
  curve;
- whether the opportunities are any good, only that they exist;
- whether the journey covers the part that matters. A map of the happy path
  with one token low point is the commonest way this artefact flatters a team.
`;
