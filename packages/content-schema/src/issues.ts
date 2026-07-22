import type { Locale } from "./constants";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  recordId?: string;
  locale?: Locale;
  path: string;
  message: string;
  remedy: string;
};

export type ParseSuccess<T> = {
  success: true;
  data: T;
  issues: [];
};

export type ParseFailure = {
  success: false;
  issues: ValidationIssue[];
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export type Eligibility = {
  eligible: boolean;
  issues: ValidationIssue[];
};

export type MigrationResult<T> =
  | {
      success: true;
      fromVersion: number;
      toVersion: number;
      data: T;
      issues: [];
    }
  | {
      success: false;
      fromVersion: number;
      toVersion: number;
      issues: ValidationIssue[];
    };
