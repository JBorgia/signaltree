/**
 * Type markers for special object serialization
 * Using compact symbols to minimize serialized size
 */
export const TYPE_MARKERS = {
  DATE: '§d',
  REGEXP: '§r',
  MAP: '§m',
  SET: '§s',
  UNDEFINED: '§u',
  NAN: '§n',
  INFINITY: '§i',
  NEG_INFINITY: '§-i',
  BIGINT: '§b',
  SYMBOL: '§y',
  FUNCTION: '§f',
  CIRCULAR: '§c',
} as const;
