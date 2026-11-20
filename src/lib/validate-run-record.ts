// Validates a runs/*.json record against schemas/run-record.schema.json (draft-07).
// Library: Ajv 8 (https://ajv.js.org/json-schema.html#draft-07), default build supports draft-07.
import Ajv from "ajv";
import schema from "../../schemas/run-record.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateRunRecord(record: unknown): { valid: boolean; errors: unknown[] } {
  const valid = validate(record) as boolean;
  return { valid, errors: valid ? [] : [...(validate.errors ?? [])] };
}
