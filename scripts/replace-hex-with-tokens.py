#!/usr/bin/env python3
"""
Replace hardcoded hex color values with CSS custom property tokens
in all component SCSS files under apps/demo/src/app/.

Design system defined in apps/demo/src/styles.scss.
"""

import re
import os
import sys

# Complete mapping: hex (lowercase) → CSS var token
# Order matters: longer/more specific matches first to avoid partial conflicts
COLOR_MAP = {
    # Primary (blue — Tailwind blue scale)
    "#eff6ff": "var(--color-primary-50)",
    "#dbeafe": "var(--color-primary-100)",
    "#bfdbfe": "var(--color-primary-200)",
    "#93c5fd": "var(--color-primary-300)",
    "#60a5fa": "var(--color-primary-400)",
    "#3b82f6": "var(--color-primary-500)",
    "#2563eb": "var(--color-primary-600)",
    "#1d4ed8": "var(--color-primary-700)",
    "#1e40af": "var(--color-primary-800)",
    "#1e3a8a": "var(--color-primary-900)",

    # Secondary (green — Tailwind green scale)
    "#f0fdf4": "var(--color-secondary-50)",
    "#dcfce7": "var(--color-secondary-100)",
    "#d1fae5": "var(--color-secondary-100)",   # emerald-100 ≈ secondary-100
    "#bbf7d0": "var(--color-secondary-200)",
    "#a7f3d0": "var(--color-secondary-200)",   # emerald-200 ≈ secondary-200
    "#86efac": "var(--color-secondary-300)",
    "#4ade80": "var(--color-secondary-400)",
    "#22c55e": "var(--color-secondary-500)",
    "#10b981": "var(--color-secondary-500)",   # emerald-500 → secondary-500
    "#16a34a": "var(--color-secondary-600)",
    "#059669": "var(--color-secondary-600)",   # emerald-600 → secondary-600
    "#15803d": "var(--color-secondary-700)",
    "#047857": "var(--color-secondary-700)",   # emerald-700 → secondary-700
    "#166534": "var(--color-secondary-800)",
    "#065f46": "var(--color-secondary-900)",   # emerald-900 → secondary-900
    "#14532d": "var(--color-secondary-900)",

    # Error (red — Tailwind red scale)
    "#fef2f2": "var(--color-error-50)",
    "#fee2e2": "var(--color-error-100)",
    "#fecaca": "var(--color-error-200)",
    "#fca5a5": "var(--color-error-300)",
    "#f87171": "var(--color-error-400)",
    "#ef4444": "var(--color-error-500)",
    "#dc2626": "var(--color-error-600)",
    "#b91c1c": "var(--color-error-700)",
    "#991b1b": "var(--color-error-800)",
    "#7f1d1d": "var(--color-error-900)",

    # Warning (yellow/amber → design system warning tokens)
    "#fef3c7": "var(--color-warning-100)",   # amber-100
    "#fde68a": "var(--color-warning-200)",   # amber-200
    "#fcd34d": "var(--color-warning-300)",   # amber-300
    "#fbbf24": "var(--color-warning-400)",   # amber-400
    "#f59e0b": "var(--color-warning-500)",   # amber-500
    "#d97706": "var(--color-warning-600)",   # amber-600
    "#b45309": "var(--color-warning-700)",   # amber-700
    "#92400e": "var(--color-warning-800)",   # amber-800
    "#78350f": "var(--color-warning-900)",   # amber-900

    # Purple (violet/purple)
    "#faf5ff": "var(--color-purple-50)",
    "#f3e8ff": "var(--color-purple-100)",
    "#e9d5ff": "var(--color-purple-200)",
    "#d8b4fe": "var(--color-purple-300)",
    "#c084fc": "var(--color-purple-400)",
    "#a855f7": "var(--color-purple-500)",
    "#8b5cf6": "var(--color-purple-500)",    # violet-500 ≈ purple-500
    "#9333ea": "var(--color-purple-600)",
    "#7c3aed": "var(--color-purple-700)",
    "#6d28d9": "var(--color-purple-700)",    # violet-700 ≈ purple-700
    "#6b21a8": "var(--color-purple-800)",
    "#581c87": "var(--color-purple-900)",

    # Info (cyan — Tailwind cyan scale)
    "#ecfeff": "var(--color-info-50)",
    "#cffafe": "var(--color-info-100)",
    "#a5f3fc": "var(--color-info-200)",
    "#67e8f9": "var(--color-info-300)",
    "#22d3ee": "var(--color-info-400)",
    "#06b6d4": "var(--color-info-500)",
    "#0891b2": "var(--color-info-600)",
    "#0e7490": "var(--color-info-700)",
    "#155e75": "var(--color-info-800)",
    "#164e63": "var(--color-info-900)",

    # Sky blue (used as info-like colors)
    "#f0f9ff": "var(--color-info-50)",       # sky-50
    "#e0f2fe": "var(--color-info-100)",      # sky-100
    "#bae6fd": "var(--color-info-200)",      # sky-200
    "#0c4a6e": "var(--color-info-900)",      # sky-900

    # Neutral (exact tokens — zinc scale)
    "#fafafa": "var(--color-neutral-50)",
    "#f5f5f5": "var(--color-neutral-100)",
    "#e5e5e5": "var(--color-neutral-200)",
    "#d4d4d4": "var(--color-neutral-300)",
    "#a3a3a3": "var(--color-neutral-400)",
    "#737373": "var(--color-neutral-500)",
    "#525252": "var(--color-neutral-600)",
    "#404040": "var(--color-neutral-700)",
    "#262626": "var(--color-neutral-800)",
    "#171717": "var(--color-neutral-900)",

    # Design system shortcuts (exact matches)
    "#1f2937": "var(--color-dark)",          # --color-dark: #1f2937
    "#f9fafb": "var(--color-light)",         # --color-light: #f9fafb
    "#e5e7eb": "var(--color-border)",        # --color-border: #e5e7eb

    # Tailwind gray scale → nearest neutral token
    "#f9fafe": "var(--color-neutral-50)",
    "#f3f4f6": "var(--color-neutral-100)",   # gray-100
    "#e0e0e0": "var(--color-neutral-200)",   # close to neutral-200
    "#f0f0f0": "var(--color-neutral-100)",
    "#d1d5db": "var(--color-neutral-300)",   # gray-300
    "#9ca3af": "var(--color-neutral-400)",   # gray-400
    "#6b7280": "var(--color-neutral-500)",   # gray-500
    "#4b5563": "var(--color-neutral-600)",   # gray-600
    "#374151": "var(--color-neutral-700)",   # gray-700
    "#111827": "var(--color-neutral-900)",   # gray-900

    # Tailwind slate scale → nearest neutral token
    "#f8fafc": "var(--color-neutral-50)",    # slate-50
    "#f1f5f9": "var(--color-neutral-100)",   # slate-100
    "#e2e8f0": "var(--color-neutral-200)",   # slate-200
    "#cbd5e1": "var(--color-neutral-300)",   # slate-300
    "#94a3b8": "var(--color-neutral-400)",   # slate-400
    "#64748b": "var(--color-neutral-500)",   # slate-500
    "#475569": "var(--color-neutral-600)",   # slate-600
    "#334155": "var(--color-neutral-700)",   # slate-700
    "#1e293b": "var(--color-neutral-800)",   # slate-800
    "#0f172a": "var(--color-neutral-900)",   # slate-900

    # Pure white/black
    "#ffffff": "var(--color-white)",
    "#000000": "var(--color-black)",

    # Orange
    "#fff7ed": "var(--color-orange-50)",
    "#ffedd5": "var(--color-orange-100)",
    "#fed7aa": "var(--color-orange-200)",
    "#fb923c": "var(--color-orange-400)",
    "#f97316": "var(--color-orange-500)",
    "#ea580c": "var(--color-orange-600)",
    "#c2410c": "var(--color-orange-700)",
    "#9a3412": "var(--color-orange-800)",

    # Gold/special
    "#ffd700": "var(--color-warning-400)",   # gold → warning-400

    # Indigo (Tailwind indigo → purple tokens — closest semantic match)
    "#eef2ff": "var(--color-purple-50)",     # indigo-50
    "#e0e7ff": "var(--color-purple-100)",    # indigo-100
    "#c7d2fe": "var(--color-purple-200)",    # indigo-200
    "#a5b4fc": "var(--color-purple-300)",    # indigo-300
    "#818cf8": "var(--color-purple-400)",    # indigo-400
    "#6366f1": "var(--color-purple-500)",    # indigo-500
    "#4f46e5": "var(--color-purple-600)",    # indigo-600
    "#4338ca": "var(--color-purple-700)",    # indigo-700
    "#3730a3": "var(--color-purple-800)",    # indigo-800
    "#312e81": "var(--color-purple-900)",    # indigo-900

    # Custom indigo variants
    "#5558e3": "var(--color-purple-600)",    # custom indigo → purple-600

    # Violet extras
    "#f5f3ff": "var(--color-purple-50)",     # violet-50 ≈ purple-50
    "#ddd6fe": "var(--color-purple-200)",    # violet-200
    "#a78bfa": "var(--color-purple-400)",    # violet-400 ≈ purple-400
    "#ede9fe": "var(--color-purple-100)",    # violet-100 ≈ purple-100

    # Very dark near-blacks
    "#1a1a1a": "var(--color-neutral-900)",   # near-black
    "#1a202c": "var(--color-neutral-900)",   # near-black (Chakra dark)

    # Light grays not yet caught
    "#f8f9fa": "var(--color-neutral-50)",    # Bootstrap gray-100
    "#f6f8fa": "var(--color-neutral-50)",    # GitHub bg
    "#f8f9ff": "var(--color-primary-50)",    # very light blue-white
    "#f0f4ff": "var(--color-primary-100)",   # light blue
    "#f0f7ff": "var(--color-primary-50)",    # light blue
    "#e8f2ff": "var(--color-primary-100)",   # light blue
    "#e0e7ff": "var(--color-purple-100)",    # indigo-100
    "#e1e8ed": "var(--color-neutral-200)",   # grayish-blue
    "#e1e4e8": "var(--color-neutral-200)",   # GitHub border
    "#d0d7de": "var(--color-neutral-300)",   # GitHub border light
    "#f1f3f5": "var(--color-neutral-100)",   # Mantine gray-0
    "#f0fff4": "var(--color-secondary-50)",  # honeydew → secondary-50
    "#ecfdf5": "var(--color-secondary-50)",  # emerald-50 ≈ secondary-50
    "#fecfe8": "var(--color-error-200)",     # pink → error-200
    "#ffeef0": "var(--color-error-50)",      # light pink → error-50
    "#ffffcc": "var(--color-warning-100)",   # light yellow
    "#fef7cd": "var(--color-warning-100)",   # light yellow
    "#ccffcc": "var(--color-secondary-100)", # light green
    "#ffcccc": "var(--color-error-100)",     # light red
    "#fefce8": "var(--color-warning-50)",    # very light yellow
    "#cbd5f5": "var(--color-primary-200)",   # light blue-purple
    "#bee3f8": "var(--color-info-100)",      # Chakra blue-100
    "#c0c0c0": "var(--color-neutral-300)",   # silver

    # Misc grays not yet caught
    "#757575": "var(--color-neutral-500)",
    "#495057": "var(--color-neutral-600)",   # Bootstrap gray
    "#4a5568": "var(--color-neutral-600)",   # Chakra gray-600
    "#34495e": "var(--color-neutral-700)",   # Flat UI wetasphalt
    "#6a737d": "var(--color-neutral-500)",   # GitHub gray
    "#e6edf3": "var(--color-neutral-100)",   # GitHub dark bg
    "#999": "var(--color-neutral-400)",
    "#757": "var(--color-neutral-600)",

    # Sky/info additions
    "#4dabf7": "var(--color-info-400)",      # Mantine blue-4
    "#7dd3fc": "var(--color-info-300)",      # sky-300
    "#075985": "var(--color-info-800)",      # sky-800
    "#0369a1": "var(--color-info-700)",      # sky-700
    "#0ea5e9": "var(--color-info-500)",      # sky-500
    "#005cc5": "var(--color-primary-700)",   # GitHub blue
    "#1565c0": "var(--color-primary-800)",   # MUI blue
    "#1864ab": "var(--color-primary-800)",   # Mantine blue
    "#2196f3": "var(--color-primary-500)",   # MUI blue-500
    "#032f62": "var(--color-primary-900)",   # GitHub dark blue
    "#339af0": "var(--color-primary-400)",   # Mantine blue-5

    # Green extras
    "#22863a": "var(--color-secondary-700)", # GitHub green
    "#34d399": "var(--color-secondary-400)", # emerald-400 → secondary-400
    "#6ee7b7": "var(--color-secondary-300)", # emerald-300 → secondary-300

    # Pink/rose → error
    "#ec4899": "var(--color-error-400)",     # pink-500 → no pink token, use error-400
    "#be123c": "var(--color-error-700)",     # rose-700 → error-700
    "#e83e8c": "var(--color-error-400)",     # Bootstrap pink

    # Red extras
    "#d73a49": "var(--color-error-600)",     # GitHub red
    "#b31d28": "var(--color-error-800)",     # GitHub dark red
    "#d32f2f": "var(--color-error-700)",     # MUI red-700

    # Orange extras
    "#e36209": "var(--color-orange-600)",    # GitHub orange
    "#cd7f32": "var(--color-orange-700)",    # bronze

    # Purple extras
    "#6f42c1": "var(--color-purple-700)",    # Bootstrap purple
    "#764ba2": "var(--color-purple-700)",    # custom gradient purple
    "#667eea": "var(--color-purple-500)",    # custom gradient blue-purple

    # Gold/special
    "#ffd700": "var(--color-warning-400)",   # gold → warning-400

    # Short hex forms
    "#888": "var(--color-neutral-400)",
    "#666": "var(--color-neutral-500)",
    "#333": "var(--color-neutral-800)",
    "#fff": "var(--color-white)",
    "#000": "var(--color-black)",
}

# Files to skip (design system definitions themselves)
SKIP_FILES = {
    "styles.scss",
    "_breakpoints.scss",
    "_variables.scss",   # We handle this separately
    "_tokens.scss",
    "main.scss",
}

# Directory containing the component files
BASE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "apps", "demo", "src", "app"
)


def make_pattern(hex_value: str) -> re.Pattern:
    """Create a regex that matches the hex value as a complete color token."""
    # Match hex value preceded by a colon, space, comma, open paren, or gradient stop
    # and followed by a non-hex character (semicolon, space, comma, close paren, !)
    escaped = re.escape(hex_value)
    # Word boundary after hex (not followed by more hex chars or letters)
    return re.compile(
        r'(?<![0-9a-fA-F])' + escaped + r'(?![0-9a-fA-F])',
        re.IGNORECASE
    )


def replace_in_file(filepath: str, replacements: list[tuple]) -> int:
    """Apply replacements to a file. Returns number of replacements made."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    count = 0
    for pattern, replacement in replacements:
        new_content = pattern.sub(replacement, content)
        count += len(pattern.findall(content))
        content = new_content

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    return count


def main():
    # Pre-compile all patterns
    replacements = [
        (make_pattern(hex_val), css_var)
        for hex_val, css_var in COLOR_MAP.items()
    ]

    total_replacements = 0
    files_changed = 0

    for root, dirs, files in os.walk(BASE_DIR):
        # Skip node_modules
        dirs[:] = [d for d in dirs if d != 'node_modules']

        for filename in files:
            if not filename.endswith('.scss'):
                continue
            if filename in SKIP_FILES:
                continue

            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, os.path.dirname(BASE_DIR))

            count = replace_in_file(filepath, replacements)
            if count > 0:
                print(f"  [{count:3d}] {rel_path}")
                total_replacements += count
                files_changed += 1

    print(f"\nTotal: {total_replacements} replacements across {files_changed} files")


if __name__ == "__main__":
    main()
