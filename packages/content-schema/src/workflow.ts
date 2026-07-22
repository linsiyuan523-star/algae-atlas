import type {
  EnglishWorkflowState,
  Locale,
  PresentWorkflowState,
} from "./constants";
import type { ValidationIssue } from "./issues";

export type WorkflowState = EnglishWorkflowState;

export type WorkflowTransition = {
  locale: Locale;
  from: WorkflowState;
  to: WorkflowState;
  reviewerEvidence?: boolean;
  operatorReason?: string;
};

export type WorkflowTransitionResult = {
  allowed: boolean;
  issues: ValidationIssue[];
};

const allowedTransitions: Record<WorkflowState, readonly WorkflowState[]> = {
  missing: ["draft"],
  draft: ["draft", "internal-review"],
  "internal-review": ["draft", "internal-review", "approved"],
  approved: ["internal-review", "approved", "published"],
  published: ["internal-review", "published", "archived"],
  archived: ["archived"],
};

function transitionIssue(
  transition: WorkflowTransition,
  code: string,
  message: string,
  remedy: string,
): ValidationIssue {
  return {
    code,
    severity: "error",
    locale: transition.locale,
    path: `locales.${transition.locale}.state`,
    message,
    remedy,
  };
}

export function validateWorkflowTransition(
  transition: WorkflowTransition,
): WorkflowTransitionResult {
  const issues: ValidationIssue[] = [];

  if (
    transition.locale === "zh" &&
    (transition.from === "missing" || transition.to === "missing")
  ) {
    issues.push(
      transitionIssue(
        transition,
        "CHINESE_LOCALE_CANNOT_BE_MISSING",
        "中文语言版本不能进入 missing 状态",
        "保留中文草稿，或使用审核后的归档状态。",
      ),
    );
  }

  if (!allowedTransitions[transition.from].includes(transition.to)) {
    issues.push(
      transitionIssue(
        transition,
        "WORKFLOW_TRANSITION_FORBIDDEN",
        `不允许从 ${transition.from} 直接转为 ${transition.to}`,
        "按 missing → draft → internal-review → approved → published 流程推进；实质修改返回 internal-review。",
      ),
    );
  }

  if (
    (transition.to === "approved" || transition.to === "published") &&
    !transition.reviewerEvidence
  ) {
    issues.push(
      transitionIssue(
        transition,
        "WORKFLOW_REVIEW_EVIDENCE_REQUIRED",
        "批准或发布转换必须有审核人证据",
        "记录有效审核人、审核日期和对应版本后重试。",
      ),
    );
  }

  if (
    transition.from === "published" &&
    transition.to === "archived" &&
    !transition.operatorReason?.trim()
  ) {
    issues.push(
      transitionIssue(
        transition,
        "WORKFLOW_ARCHIVE_REASON_REQUIRED",
        "归档已发布内容必须记录操作原因",
        "填写不含敏感信息的归档原因后重试。",
      ),
    );
  }

  return { allowed: issues.length === 0, issues };
}

export function stateAfterSubstantiveEdit(
  current: PresentWorkflowState,
): PresentWorkflowState {
  return current === "approved" || current === "published"
    ? "internal-review"
    : current;
}
