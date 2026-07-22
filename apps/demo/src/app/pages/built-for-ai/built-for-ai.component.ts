import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

/**
 * "Built for AI coding agents" landing page.
 *
 * Surfaces the AI-discoverability investment as a marketable strength:
 * - llms.txt / llms-full.txt at site root
 * - Agent skill shipped in every npm tarball
 * - Drop-in .cursorrules / CLAUDE.md / copilot-instructions.md templates
 * - Anti-hallucination myths doc
 * - Honest NgRx comparison
 * - AI-codegen accuracy benchmark scaffolding
 */
@Component({
  selector: 'app-built-for-ai',
  standalone: true,
  imports: [CommonModule, RouterModule, CodeTabsComponent],
  templateUrl: './built-for-ai.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './built-for-ai.component.scss',
})
export class BuiltForAIComponent {
  /** Copy-paste commands to install the shipped agent skill. */
  readonly skillInstall: CodeFile[] = [
    {
      label: 'install-skill.sh',
      language: 'bash',
      source: `cp -r node_modules/@signaltree/core/skills/using-signaltree .cursor/skills/
cp -r node_modules/@signaltree/core/skills/using-signaltree .claude/skills/`,
    },
  ];
}
