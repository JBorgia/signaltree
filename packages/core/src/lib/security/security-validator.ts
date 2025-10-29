/**
 * Security validator for SignalTree to prevent common vulnerabilities
 * @packageDocumentation
 */

/**
 * Security event types for monitoring and logging
 */
export type SecurityEventType =
  | 'dangerous-key-blocked'
  | 'xss-attempt-blocked'
  | 'function-value-blocked'
  | 'validation-error';

/**
 * Security event callback signature
 */
export interface SecurityEvent {
  type: SecurityEventType;
  key?: string;
  value?: unknown;
  reason: string;
  timestamp: number;
}

/**
 * Configuration options for SecurityValidator
 */
export interface SecurityValidatorConfig {
  /**
   * Enable prototype pollution prevention (default: true)
   */
  preventPrototypePollution?: boolean;

  /**
   * Enable XSS sanitization (default: false)
   * When enabled, string values are sanitized to prevent script injection
   */
  preventXSS?: boolean;

  /**
   * Reject function values to ensure serializable state (default: true)
   * Functions cannot be serialized and break time-travel, persistence, etc.
   * This is ALWAYS enforced with no escape hatch to guarantee state serializability.
   */
  preventFunctions?: boolean;

  /**
   * Additional dangerous keys to block beyond the built-in list
   */
  customDangerousKeys?: string[];

  /**
   * Callback for security events (for logging/monitoring)
   */
  onSecurityEvent?: (event: SecurityEvent) => void;

  /**
   * Sanitization mode: 'strict' removes all HTML, 'permissive' allows safe HTML
   * (default: 'strict')
   */
  sanitizationMode?: 'strict' | 'permissive';
}

/**
 * Built-in dangerous keys that can lead to prototype pollution
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Basic HTML tag pattern for XSS detection
 */
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Dangerous HTML patterns that should always be blocked
 */
const DANGEROUS_HTML_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=/gi, // Event handlers like onclick=
  /javascript:/gi,
  /<iframe\b/gi,
  /<object\b/gi,
  /<embed\b/gi,
];

/**
 * SecurityValidator prevents common security vulnerabilities in SignalTree
 *
 * Features:
 * - Prototype pollution prevention (blocks __proto__, constructor, prototype)
 * - XSS prevention (sanitizes string values)
 * - Security event callbacks for monitoring
 * - Configurable validation rules
 *
 * @example
 * ```ts
 * const validator = new SecurityValidator({
 *   preventPrototypePollution: true,
 *   preventXSS: true,
 *   onSecurityEvent: (event) => console.warn('Security event:', event)
 * });
 *
 * // This will throw an error
 * validator.validateKey('__proto__');
 *
 * // This will sanitize the value
 * const safe = validator.validateValue('<script>alert("xss")</script>');
 * ```
 */
export class SecurityValidator {
  private readonly config: Required<SecurityValidatorConfig>;
  private readonly dangerousKeys: Set<string>;

  constructor(config: SecurityValidatorConfig = {}) {
    this.config = {
      preventPrototypePollution: config.preventPrototypePollution ?? true,
      preventXSS: config.preventXSS ?? false,
      preventFunctions: config.preventFunctions ?? true,
      customDangerousKeys: config.customDangerousKeys ?? [],
      onSecurityEvent:
        config.onSecurityEvent ??
        (() => {
          // Default no-op callback
        }),
      sanitizationMode: config.sanitizationMode ?? 'strict',
    };

    // Build set of dangerous keys for O(1) lookup
    this.dangerousKeys = new Set([
      ...DANGEROUS_KEYS,
      ...this.config.customDangerousKeys,
    ]);
  }

  /**
   * Validate a key to prevent prototype pollution
   *
   * @param key - The key to validate
   * @throws Error if the key is dangerous and validation is enabled
   */
  validateKey(key: string): void {
    if (!this.config.preventPrototypePollution) {
      return;
    }

    if (this.dangerousKeys.has(key)) {
      const event: SecurityEvent = {
        type: 'dangerous-key-blocked',
        key,
        reason: `Dangerous key "${key}" blocked to prevent prototype pollution`,
        timestamp: Date.now(),
      };

      this.config.onSecurityEvent(event);

      throw new Error(
        `[SignalTree Security] Dangerous key "${key}" is not allowed. ` +
          `This key can lead to prototype pollution attacks. ` +
          `Blocked keys: ${Array.from(this.dangerousKeys).join(', ')}`
      );
    }
  }

  /**
   * Validate and sanitize a value to prevent XSS and block functions
   *
   * @param value - The value to validate
   * @returns The sanitized value (or original if not a string or validation disabled)
   * @throws Error if value is a function and preventFunctions is enabled
   */
  validateValue<T>(value: T): T {
    // Block function values to ensure serializable state
    if (this.config.preventFunctions && typeof value === 'function') {
      const event: SecurityEvent = {
        type: 'function-value-blocked',
        value,
        reason: 'Function values are not allowed - state must be serializable',
        timestamp: Date.now(),
      };

      this.config.onSecurityEvent(event);

      throw new Error(
        `[SignalTree Security] Function values are not allowed in state trees. ` +
          `Functions cannot be serialized, breaking features like time-travel, ` +
          `persistence, debugging, and SSR. ` +
          `\n\nTo fix this:` +
          `\n  - Store function references outside the tree` +
          `\n  - Use method names (strings) and a function registry` +
          `\n  - Use computed signals for derived values` +
          `\n\nBlocked value: ${value.toString().substring(0, 100)}...`
      );
    }

    if (!this.config.preventXSS || typeof value !== 'string') {
      return value;
    }

    // Check for dangerous patterns first
    let hasDangerousPattern = false;
    for (const pattern of DANGEROUS_HTML_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        hasDangerousPattern = true;
        break;
      }
    }

    if (hasDangerousPattern) {
      const event: SecurityEvent = {
        type: 'xss-attempt-blocked',
        value,
        reason: 'Dangerous HTML pattern detected and sanitized',
        timestamp: Date.now(),
      };

      this.config.onSecurityEvent(event);

      // In strict mode, remove all HTML
      // In permissive mode, we still block dangerous patterns
      return this.sanitize(value) as T;
    }

    // Apply general sanitization based on mode
    return this.sanitize(value) as T;
  }

  /**
   * Sanitize a string value based on the configured mode
   *
   * @param value - The string to sanitize
   * @returns The sanitized string
   */
  private sanitize(value: string): string {
    if (this.config.sanitizationMode === 'strict') {
      // First remove dangerous patterns, then all HTML tags
      let sanitized = value;
      for (const pattern of DANGEROUS_HTML_PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        sanitized = sanitized.replace(pattern, '');
      }
      // Then remove all remaining HTML tags
      return sanitized.replace(HTML_TAG_PATTERN, '');
    } else {
      // Permissive mode: only remove dangerous patterns
      let sanitized = value;
      for (const pattern of DANGEROUS_HTML_PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        sanitized = sanitized.replace(pattern, '');
      }
      return sanitized;
    }
  }

  /**
   * Validate both key and value (convenience method)
   *
   * @param key - The key to validate
   * @param value - The value to validate
   * @returns The sanitized value
   */
  validateKeyValue<T>(key: string, value: T): T {
    this.validateKey(key);
    return this.validateValue(value);
  }

  /**
   * Check if a key is dangerous without throwing
   *
   * @param key - The key to check
   * @returns true if the key is dangerous
   */
  isDangerousKey(key: string): boolean {
    return this.dangerousKeys.has(key);
  }

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<Required<SecurityValidatorConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a SecurityValidator with common presets
 */
export const SecurityPresets = {
  /**
   * Strict security: All protections enabled (recommended for production)
   */
  strict: (): SecurityValidator =>
    new SecurityValidator({
      preventPrototypePollution: true,
      preventXSS: true,
      preventFunctions: true,
      sanitizationMode: 'strict',
    }),

  /**
   * Standard security: Prototype pollution and function blocking (default)
   */
  standard: (): SecurityValidator =>
    new SecurityValidator({
      preventPrototypePollution: true,
      preventXSS: false,
      preventFunctions: true,
    }),

  /**
   * Permissive security: Only prototype pollution prevention
   * WARNING: Allows functions, breaking serialization features
   */
  permissive: (): SecurityValidator =>
    new SecurityValidator({
      preventPrototypePollution: true,
      preventXSS: false,
      preventFunctions: false,
    }),

  /**
   * Disabled: No security validations
   * DANGER: Not recommended - allows prototype pollution and functions
   */
  disabled: (): SecurityValidator =>
    new SecurityValidator({
      preventPrototypePollution: false,
      preventXSS: false,
      preventFunctions: false,
    }),
};
