import {
  PRESENT_WORKFLOW_STATES,
  REVIEW_STATUSES,
  TRANSLATION_ORIGINS,
} from "@algae-atlas/content-schema";
import type { Locale } from "@algae-atlas/content-schema";
import type { ReactNode } from "react";
import type {
  LocaleWorkflowErrors,
  LocaleWorkflowInput,
} from "../locale-workflow";

type LocaleWorkflowFieldsProps = {
  locale: Locale;
  value: LocaleWorkflowInput;
  errors: LocaleWorkflowErrors;
  disabled?: boolean;
  showReviewControls?: boolean;
  onChange: <Key extends keyof LocaleWorkflowInput>(
    field: Key,
    value: LocaleWorkflowInput[Key],
  ) => void;
};

const stateLabels = {
  draft: "草稿",
  "internal-review": "审核中",
  approved: "发布候选",
  published: "已发布",
  archived: "已归档",
} as const;

const reviewLabels = {
  draft: "未提交审核",
  "internal-review": "审核中",
  reviewed: "已审核",
} as const;

const originLabels = {
  "source-authored": "英文原稿",
  "human-translated": "人工翻译",
  "machine-assisted": "机器辅助",
} as const;

export function LocaleWorkflowFields({
  locale,
  value,
  errors,
  disabled = false,
  showReviewControls = true,
  onChange,
}: LocaleWorkflowFieldsProps) {
  const prefix = `${locale}-workflow`;
  const label = locale === "zh" ? "中文" : "英文";
  return (
    <section className="locale-workflow" aria-labelledby={`${prefix}-title`}>
      <header className="locale-workflow-heading">
        <h4 id={`${prefix}-title`}>{label}语言状态</h4>
        <span className="locale-state-badge" data-state={value.state}>
          {stateLabels[value.state]}
        </span>
      </header>

      <div className="locale-workflow-grid">
        <WorkflowField label="语言状态" id={`${prefix}-state`} error={errors.state}>
          <select
            id={`${prefix}-state`}
            value={value.state}
            disabled={disabled}
            aria-invalid={Boolean(errors.state)}
            aria-describedby={errors.state ? `${prefix}-state-error` : undefined}
            onChange={(event) =>
              onChange("state", event.target.value as LocaleWorkflowInput["state"])
            }
          >
            {PRESENT_WORKFLOW_STATES.map((state) => (
              <option key={state} value={state}>
                {stateLabels[state]}
              </option>
            ))}
          </select>
        </WorkflowField>

        {locale === "en" ? (
          <WorkflowField
            label="英文来源"
            id={`${prefix}-origin`}
            error={errors.translationOrigin}
          >
            <select
              id={`${prefix}-origin`}
              value={value.translationOrigin}
              disabled={disabled}
              aria-invalid={Boolean(errors.translationOrigin)}
              aria-describedby={
                errors.translationOrigin ? `${prefix}-origin-error` : undefined
              }
              onChange={(event) =>
                onChange(
                  "translationOrigin",
                  event.target.value as LocaleWorkflowInput["translationOrigin"],
                )
              }
            >
              {TRANSLATION_ORIGINS.map((origin) => (
                <option key={origin} value={origin}>
                  {originLabels[origin]}
                </option>
              ))}
            </select>
          </WorkflowField>
        ) : null}

        {showReviewControls ? (
          <>
        <WorkflowField
          label="审核状态"
          id={`${prefix}-review-status`}
          error={errors.reviewStatus}
        >
          <select
            id={`${prefix}-review-status`}
            value={value.reviewStatus}
            disabled={disabled}
            aria-invalid={Boolean(errors.reviewStatus)}
            aria-describedby={
              errors.reviewStatus ? `${prefix}-review-status-error` : undefined
            }
            onChange={(event) =>
              onChange(
                "reviewStatus",
                event.target.value as LocaleWorkflowInput["reviewStatus"],
              )
            }
          >
            {REVIEW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {reviewLabels[status]}
              </option>
            ))}
          </select>
        </WorkflowField>

        <WorkflowField
          label="审核更新时间"
          id={`${prefix}-review-updated-at`}
          error={errors.reviewUpdatedAt}
        >
          <input
            id={`${prefix}-review-updated-at`}
            type="date"
            value={value.reviewUpdatedAt}
            disabled={disabled}
            aria-invalid={Boolean(errors.reviewUpdatedAt)}
            aria-describedby={
              errors.reviewUpdatedAt
                ? `${prefix}-review-updated-at-error`
                : undefined
            }
            onChange={(event) => onChange("reviewUpdatedAt", event.target.value)}
          />
        </WorkflowField>

        <WorkflowField
          label="审核版本"
          id={`${prefix}-review-version`}
          error={errors.reviewVersion}
        >
          <input
            id={`${prefix}-review-version`}
            type="text"
            inputMode="decimal"
            value={value.reviewVersion}
            disabled={disabled}
            placeholder="0.1"
            aria-invalid={Boolean(errors.reviewVersion)}
            aria-describedby={
              errors.reviewVersion ? `${prefix}-review-version-error` : undefined
            }
            onChange={(event) => onChange("reviewVersion", event.target.value)}
          />
        </WorkflowField>

        <WorkflowField
          label="审核人稳定 ID"
          id={`${prefix}-reviewers`}
          error={errors.reviewerIds}
        >
          <textarea
            id={`${prefix}-reviewers`}
            rows={2}
            value={value.reviewerIds}
            disabled={disabled}
            placeholder="reviewer-id"
            aria-invalid={Boolean(errors.reviewerIds)}
            aria-describedby={
              errors.reviewerIds ? `${prefix}-reviewers-error` : undefined
            }
            onChange={(event) => onChange("reviewerIds", event.target.value)}
          />
        </WorkflowField>

        {value.reviewStatus === "reviewed" ? (
          <WorkflowField
            label="审核日期"
            id={`${prefix}-reviewed-at`}
            error={errors.reviewedAt}
          >
            <input
              id={`${prefix}-reviewed-at`}
              type="date"
              value={value.reviewedAt}
              disabled={disabled}
              aria-invalid={Boolean(errors.reviewedAt)}
              aria-describedby={
                errors.reviewedAt ? `${prefix}-reviewed-at-error` : undefined
              }
              onChange={(event) => onChange("reviewedAt", event.target.value)}
            />
          </WorkflowField>
        ) : null}

        {locale === "en" && value.translationOrigin === "machine-assisted" ? (
          <WorkflowField
            label="人工复核人稳定 ID"
            id={`${prefix}-human-verifier`}
            error={errors.humanVerifiedBy}
          >
            <input
              id={`${prefix}-human-verifier`}
              type="text"
              value={value.humanVerifiedBy}
              disabled={disabled}
              placeholder="reviewer-id"
              aria-invalid={Boolean(errors.humanVerifiedBy)}
              aria-describedby={
                errors.humanVerifiedBy
                  ? `${prefix}-human-verifier-error`
                  : undefined
              }
              onChange={(event) => onChange("humanVerifiedBy", event.target.value)}
            />
          </WorkflowField>
        ) : null}
          </>
        ) : null}

        {value.state === "published" ? (
          <WorkflowField
            label="发布时间"
            id={`${prefix}-published-at`}
            error={errors.publishedAt}
          >
            <input
              id={`${prefix}-published-at`}
              type="text"
              value={value.publishedAt}
              disabled={disabled}
              placeholder="2026-07-24T09:00:00+08:00"
              aria-invalid={Boolean(errors.publishedAt)}
              aria-describedby={
                errors.publishedAt ? `${prefix}-published-at-error` : undefined
              }
              onChange={(event) => onChange("publishedAt", event.target.value)}
            />
          </WorkflowField>
        ) : null}
      </div>
    </section>
  );
}

function WorkflowField({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
