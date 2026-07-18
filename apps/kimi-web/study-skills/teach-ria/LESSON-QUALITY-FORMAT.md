# Chinese lesson quality contract

This contract applies to every published `lessons/*.html` file. It is a set of
teaching and evidence obligations, not a prose template: section length,
examples, and ordering should follow the source and the learner's Mission.

## Learner-facing structure

Use one `<h1>` and `<html lang="zh-CN">`. A lesson must make these moves visible:

| Move | HTML id | Purpose |
|---|---|---|
| Learning objective | `learning-objective` | One observable capability, not “understand the chapter”. |
| Core concept | `core-concept` | The source idea with its conditions and scope. |
| Plain explanation | `plain-explanation` | Natural Chinese that explains the difficult step progressively. |
| Source example | `source-example` or `original-case` | A traceable example actually supported by the material. |
| Application example | `application-example` or `transfer-example` | A clearly labelled teaching example, never disguised as source fact. |
| Misconception or boundary | `misconception` or `boundary-misconception` | A plausible misuse, counterexample, or limit. |
| Lesson summary | `lesson-summary` | A compact decision rule or reasoning chain, not an AI-style recap. |
| Self-check | `self-check` or `practice-feedback` | A task aligned to the objective plus answer logic or immediate feedback. |
| Source anchors | `source-anchors` | Every stable source location used in the lesson. |

Do not repeat a generic definition, welcome paragraph, motivational sentence,
or identical summary across lessons. Retrieve prior knowledge only when it is
needed for the current move.

## Evidence labelling

Wrap source-grounded claims or cases in a visible block with both attributes:

```html
<p data-evidence="source" data-source-anchor="第 2 节：状态指示灯">
  材料中说明：蓝灯慢闪表示设备正在等待配对。
</p>
```

The anchor must be a real, stable location reopened during authoring. Generic
values such as `原文`, `材料`, or `参考资料` are invalid. List the same anchor
verbatim in `source-anchors`.

Wrap an invented teaching transfer separately:

```html
<p data-evidence="teaching-example">
  教学示例：把指示灯当作排查入口。这个情境用于练习，不是材料中的真实案例。
</p>
```

If the source cannot support a requested example or factual detail, say
`资料中未找到可核验依据` and omit the claim. Never create a page number,
quotation, actor, outcome, statistic, policy threshold, or technical behavior.

## Chinese writing rules

- Write idiomatic, compact Chinese; reorganize source syntax instead of
  translating English sentence order.
- Start from the learner's concrete difficulty. Avoid ceremonial introductions,
  motivational filler, and “让我们开启学习之旅” language.
- Explain one hard step at a time. Keep source facts, teaching examples, and
  uncertainty visibly distinct.
- Preserve the source's complete reasoning and boundary when compression would
  turn it into a slogan.
- Use examples only when they expose the concept or decision rule.
- Make self-check feedback explain why an answer succeeds or fails.

## Publication gate

Before adding a lesson to `lessons/index.json`:

1. reopen every named source anchor;
2. compare every source-labelled claim against that location;
3. run the course checker, which applies `scripts/lesson_quality.py`;
4. compare published lessons for repeated learner-facing paragraphs;
5. publish the HTML, lesson index, and snapshot in the documented atomic order.

Structural checks cannot prove factual truth. Passing them is permission to
publish only after the semantic source comparison above is complete.
