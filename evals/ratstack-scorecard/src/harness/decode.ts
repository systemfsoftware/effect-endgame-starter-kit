export type JsonObject = { readonly [key: string]: JsonValue }

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject

const scalarTypes: Readonly<Record<string, true>> = { boolean: true, number: true, string: true }

const isScalar = (value: unknown): value is null | boolean | number | string =>
  value === null || scalarTypes[typeof value] === true

const isObjectLike = (value: unknown): value is object => typeof value === 'object' && value !== null

export const isJsonArray = (value: unknown): value is readonly JsonValue[] => Array.isArray(value)

export const isJsonObject = (value: unknown): value is JsonObject => isObjectLike(value) && !isJsonArray(value)

const arrayChildrenAreJson = (value: unknown): value is readonly JsonValue[] =>
  isJsonArray(value) && value.every(isJsonValue)

const objectChildrenAreJson = (value: unknown): value is JsonObject =>
  isJsonObject(value) && Object.values(value).every(isJsonValue)

const childrenAreJson = (value: unknown): value is JsonObject | readonly JsonValue[] =>
  arrayChildrenAreJson(value) || objectChildrenAreJson(value)

export const isJsonValue = (value: unknown): value is JsonValue => isScalar(value) || childrenAreJson(value)

export const parseJson = (text: string): JsonValue => {
  const found = [JSON.parse(text)].find(isJsonValue)
  if (found !== undefined) return found
  throw new Error('parseJson: the text is not a JSON value')
}

export const at = (value: JsonValue, key: string): JsonValue | undefined => isJsonObject(value) ? value[key] : undefined

const pathOf = (value: JsonValue, path: readonly string[]): JsonValue | undefined =>
  path.reduce<JsonValue | undefined>((found, key) => (found === undefined ? undefined : at(found, key)), value)

const refusal = (what: string, path: readonly string[], expected: string): Error =>
  new Error(`${what}: expected ${expected} at ${path.join('.') || '<root>'}`)

export const stringAt = (value: JsonValue, path: readonly string[], what: string): string => {
  const found = pathOf(value, path)
  if (typeof found === 'string') return found
  throw refusal(what, path, 'a string')
}

export const numberAt = (value: JsonValue, path: readonly string[], what: string): number => {
  const found = pathOf(value, path)
  if (typeof found === 'number') return found
  throw refusal(what, path, 'a number')
}

export const arrayAt = (value: JsonValue, path: readonly string[], what: string): readonly JsonValue[] => {
  const found = pathOf(value, path)
  if (isJsonArray(found)) return found
  throw refusal(what, path, 'an array')
}

export const objectAt = (value: JsonValue, path: readonly string[], what: string): JsonObject => {
  const found = pathOf(value, path)
  if (isJsonObject(found)) return found
  throw refusal(what, path, 'an object')
}

export const optionalEntriesAt = (
  value: JsonValue,
  path: readonly string[],
): readonly (readonly [string, JsonValue])[] => {
  const found = pathOf(value, path)
  return isJsonObject(found) ? Object.entries(found) : []
}
