export type SecurityEventType = 'dangerous-key-blocked' | 'xss-attempt-blocked' | 'function-value-blocked' | 'validation-error';
export interface SecurityEvent {
    type: SecurityEventType;
    key?: string;
    value?: unknown;
    reason: string;
    timestamp: number;
}
export interface SecurityValidatorConfig {
    preventPrototypePollution?: boolean;
    preventXSS?: boolean;
    preventFunctions?: boolean;
    customDangerousKeys?: string[];
    onSecurityEvent?: (event: SecurityEvent) => void;
    sanitizationMode?: 'strict' | 'permissive';
}
export declare class SecurityValidator {
    private readonly config;
    private readonly dangerousKeys;
    constructor(config?: SecurityValidatorConfig);
    validateKey(key: string): void;
    validateValue<T>(value: T): T;
    private sanitize;
    validateKeyValue<T>(key: string, value: T): T;
    isDangerousKey(key: string): boolean;
    getConfig(): Readonly<Required<SecurityValidatorConfig>>;
}
export declare const SecurityPresets: {
    strict: () => SecurityValidator;
    standard: () => SecurityValidator;
    permissive: () => SecurityValidator;
    disabled: () => SecurityValidator;
};
