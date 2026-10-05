export type Decoder<T> = (value: unknown, path: string) => T

export class DecodeError extends Error {
  constructor(readonly path: string, readonly expected: string, readonly found: unknown) {
    super(`expected ${expected} at ${path || '<root>'}, found ${JSON.stringify(found)?.slice(0, 80)}`)
  }
}

const fail = (path: string, expected: string, found: unknown): never => {
  throw new DecodeError(path, expected, found)
}

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const fieldOf = (value: object, key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value

export const string: Decoder<string> = (value, path) =>
  typeof value === 'string' ? value : fail(path, 'a string', value)

export const number: Decoder<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'a finite number', value)

export const literal = <const L extends string | number>(expected: L): Decoder<L> => (value, path) =>
  value === expected ? expected : fail(path, JSON.stringify(expected), value)

export const oneOf = <const L extends string>(options: readonly L[]): Decoder<L> => (value, path) =>
  options.find((option) => option === value) ?? fail(path, `one of ${options.join(', ')}`, value)

export const array = <T>(item: Decoder<T>): Decoder<readonly T[]> => (value, path) =>
  Array.isArray(value) ? value.map((entry, index) => item(entry, `${path}[${index}]`)) : fail(path, 'an array', value)

export const tuple2 = <A, B>(first: Decoder<A>, second: Decoder<B>): Decoder<readonly [A, B]> => (value, path) =>
  Array.isArray(value) && value.length === 2
    ? [first(value[0], `${path}[0]`), second(value[1], `${path}[1]`)]
    : fail(path, 'a pair', value)

export const record = <T>(entry: Decoder<T>): Decoder<Readonly<Record<string, T>>> => (value, path) =>
  isObject(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, entry(item, `${path}.${key}`)]))
    : fail(path, 'an object', value)

type Fields = Readonly<Record<string, Decoder<unknown>>>
type Decoded<F extends Fields> = { readonly [K in keyof F]: F[K] extends Decoder<infer T> ? T : never }

export const struct = <F extends Fields>(fields: F): Decoder<Decoded<F>> => (value, path) =>
  isObject(value)
    ? Object.fromEntries(
      Object.entries(fields).map(([key, decode]) => [key, decode(fieldOf(value, key), `${path}.${key}`)]),
    ) as Decoded<F>
    : fail(path, 'an object', value)

export const optional = <T>(decode: Decoder<T>): Decoder<T | undefined> => (value, path) =>
  value === undefined ? undefined : decode(value, path)

export const union = <T>(...options: readonly Decoder<T>[]): Decoder<T> => (value, path) => {
  const errors: string[] = []
  for (const option of options) {
    try {
      return option(value, path)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return fail(path, `one of ${options.length} shapes (${errors.join('; ')})`, value)
}

export const decodeJson = <T>(decode: Decoder<T>, text: string, what: string): T => {
  try {
    return decode(JSON.parse(text), what)
  } catch (error) {
    throw new Error(`${what}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
