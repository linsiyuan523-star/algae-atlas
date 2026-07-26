import assert from "node:assert/strict";
import test from "node:test";

import {
  stateAfterSubstantiveEdit,
  validateWorkflowTransition,
  type WorkflowTransition,
} from "../src/index";

const matrix: Array<
  [string, WorkflowTransition, boolean]
> = [
  [
    "英文 missing 到 draft",
    { locale: "en", from: "missing", to: "draft" },
    true,
  ],
  [
    "draft 到 internal-review",
    { locale: "zh", from: "draft", to: "internal-review" },
    true,
  ],
  [
    "internal-review 到 approved 需要审核证据",
    {
      locale: "zh",
      from: "internal-review",
      to: "approved",
      reviewerEvidence: true,
    },
    true,
  ],
  [
    "approved 到 published 需要审核证据",
    {
      locale: "zh",
      from: "approved",
      to: "published",
      reviewerEvidence: true,
    },
    true,
  ],
  [
    "published 实质修改返回 internal-review",
    { locale: "zh", from: "published", to: "internal-review" },
    true,
  ],
  [
    "published 不能直接降为 draft",
    { locale: "zh", from: "published", to: "draft" },
    false,
  ],
  [
    "published 可带原因归档",
    {
      locale: "zh",
      from: "published",
      to: "archived",
      operatorReason: "fixture archive reason",
    },
    true,
  ],
  [
    "archived 不能直接恢复 published",
    {
      locale: "zh",
      from: "archived",
      to: "published",
      reviewerEvidence: true,
    },
    false,
  ],
];

for (const [name, transition, allowed] of matrix) {
  test(name, () => {
    const result = validateWorkflowTransition(transition);
    assert.equal(result.allowed, allowed, JSON.stringify(result.issues, null, 2));
  });
}

test("中文不能使用 missing，审核证据与归档原因不可省略", () => {
  assert.equal(
    validateWorkflowTransition({
      locale: "zh",
      from: "missing",
      to: "draft",
    }).allowed,
    false,
  );
  assert.equal(
    validateWorkflowTransition({
      locale: "zh",
      from: "internal-review",
      to: "approved",
    }).allowed,
    false,
  );
  assert.equal(
    validateWorkflowTransition({
      locale: "zh",
      from: "published",
      to: "archived",
    }).allowed,
    false,
  );
});

test("实质修改只把 approved/published 返回 internal-review", () => {
  assert.equal(stateAfterSubstantiveEdit("published"), "internal-review");
  assert.equal(stateAfterSubstantiveEdit("approved"), "internal-review");
  assert.equal(stateAfterSubstantiveEdit("draft"), "draft");
});
