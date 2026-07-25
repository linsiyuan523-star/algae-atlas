import type { ContentType } from "@algae-atlas/content-schema";
import type { RecordDraft } from "../schema-drafts";
import { batchOneFormAdapters } from "./batch-one";
import { batchTwoFormAdapters } from "./batch-two";
import type {
  FormErrors,
  FormSchemaDefinition,
  FormValidationMode,
  FormValues,
} from "./form-engine";
import {
  emptyTeamNewsFormValues,
  inspectTeamNewsForm,
  teamNewsFormSchema,
  validateTeamNewsRecordDraft,
} from "./team-news";
import type { TeamNewsFormValues } from "./team-news";

export type ContentFormResult =
  | { success: true; recordDraft: RecordDraft; errors: FormErrors }
  | { success: false; errors: FormErrors };

export type ContentFormAdapter = {
  contentType: ContentType;
  schema: FormSchemaDefinition;
  emptyValues: () => FormValues;
  inspect: (recordDraft: unknown) => {
    values: FormValues;
    errors: FormErrors;
  };
  validate: (
    recordDraft: unknown,
    values: FormValues,
    mode?: FormValidationMode,
  ) => ContentFormResult;
};

const teamNewsAdapter: ContentFormAdapter = {
  contentType: "team-news",
  schema: teamNewsFormSchema,
  emptyValues: emptyTeamNewsFormValues,
  inspect: inspectTeamNewsForm,
  validate: (recordDraft, values, mode) =>
    validateTeamNewsRecordDraft(
      recordDraft,
      values as TeamNewsFormValues,
      mode,
    ),
};

const adapters: Partial<Record<ContentType, ContentFormAdapter>> = {
  "team-news": teamNewsAdapter,
  ...batchOneFormAdapters,
  ...batchTwoFormAdapters,
};

export function getContentFormAdapter(
  contentType: string,
): ContentFormAdapter | null {
  return adapters[contentType as ContentType] ?? null;
}
