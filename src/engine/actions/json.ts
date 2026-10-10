import type { JsonValue } from "../events";
import type { Action } from "./types";

export type JsonObject = { [key: string]: JsonValue };

/** The action as a plain JSON object for event data (undefined fields dropped). */
export function actionJson(action: Action): JsonObject {
  const json: JsonObject = {};
  for (const [key, value] of Object.entries(action)) {
    if (value !== undefined) json[key] = value as JsonValue;
  }
  return json;
}
