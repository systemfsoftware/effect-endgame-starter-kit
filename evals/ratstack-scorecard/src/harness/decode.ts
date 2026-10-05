export const at = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined

const pathOf = (value: unknown, path: readonly string[]): unknown => path.reduce(at, value)

const refuse = (what: string, path: readonly string[], expected: string): never => {
  throw new Error(`${what}: expected ${expected} at ${path.join('.') || '<root>'}`)
}

export const stringAt = (value: unknown, path: readonly string[], what: string): string => {
  const found = pathOf(value, path)
  return typeof found === 'string' ? found : refuse(what, path, 'a string')
}

export const numberAt = (value: unknown, path: readonly string[], what: string): number => {
  const found = pathOf(value, path)
  return typeof found === 'number' ? found : refuse(what, path, 'a number')
}

export const arrayAt = (value: unknown, path: readonly string[], what: string): readonly unknown[] => {
  const found = pathOf(value, path)
  return Array.isArray(found) ? found : refuse(what, path, 'an array')
}

export const entriesAt = (
  value: unknown,
  path: readonly string[],
  what: string,
): readonly (readonly [string, unknown])[] => {
  const found = pathOf(value, path)
  return typeof found === 'object' && found !== null && !Array.isArray(found)
    ? Object.entries(found)
    : refuse(what, path, 'an object')
}

export const optionalEntriesAt = (value: unknown, path: readonly string[]): readonly (readonly [string, unknown])[] => {
  const found = pathOf(value, path)
  return typeof found === 'object' && found !== null && !Array.isArray(found) ? Object.entries(found) : []
}
