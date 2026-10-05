const packageIdOf = (key: string): string => key.replace(/^\//u, '').replace(/\(.*\)$/u, '')

export const distinctPackages = (keys: readonly string[]): readonly string[] =>
  [...new Set(keys.map(packageIdOf))].sort()
