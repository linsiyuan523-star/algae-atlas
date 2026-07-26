import {
  CONTENT_TYPES,
  contentTypeRegistry,
  parseRecord,
  serializeRecord,
} from "../src/index";
import { validRecordFixtures } from "../fixtures/index";

for (const type of CONTENT_TYPES) {
  const parsed = parseRecord(validRecordFixtures[type]);
  if (!parsed.success) {
    throw new Error(`Browser contract rejected ${type}: ${JSON.stringify(parsed.issues)}`);
  }
  const serialized = serializeRecord(parsed.data);
  if (!serialized.endsWith("\n")) {
    throw new Error(`Browser serializer omitted trailing LF for ${type}`);
  }
}

if (Object.keys(contentTypeRegistry).length !== CONTENT_TYPES.length) {
  throw new Error("Browser field registry is incomplete");
}

export const browserContractResult = {
  schemaVersion: 1,
  validatedTypes: [...CONTENT_TYPES],
};
