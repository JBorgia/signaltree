export function normalizeScopedValuePath(relativePath: string): string {
  return relativePath === 'values'
    ? ''
    : relativePath.startsWith('values.')
      ? relativePath.slice('values.'.length)
      : relativePath;
}
