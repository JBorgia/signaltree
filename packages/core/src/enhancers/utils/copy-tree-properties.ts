export function copyTreeProperties<T extends object>(
  source: T,
  target: T
): void {
  // Copy all own string-keyed property descriptors from source to target.
  // Do not skip when the property exists on the prototype chain; we want
  // the enhanced tree to have the same own properties as the source.
  // Copy all string-keyed own properties (preserve descriptors).
  // Skip copying internal `state` and `$` properties to avoid conflicts
  // where enhancers might want to define them with different descriptors.
  const skipKeys = new Set<PropertyKey>(['state', '$']);
  for (const key of Object.getOwnPropertyNames(source)) {
    if (skipKeys.has(key)) continue;
    // Only skip if the target already has its own property with the same name.
    if (Object.prototype.hasOwnProperty.call(target, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    // Avoid copying non-configurable descriptors which would block later redefinition.
    if (descriptor.configurable === false) continue;
    Object.defineProperty(target, key, descriptor);
  }

  // Also copy symbol keys (in case enhancers or tree use Symbols)
  for (const sym of Object.getOwnPropertySymbols(source)) {
    if (Object.prototype.hasOwnProperty.call(target, sym)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(
      source,
      sym as unknown as PropertyKey
    );
    if (!descriptor) continue;
    if (descriptor.configurable === false) continue;
    Object.defineProperty(target, sym, descriptor);
  }
}
