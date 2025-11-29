import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import { marked } from 'marked';
import { lastValueFrom } from 'rxjs';

interface DocPackage {
  id: string;
  name: string;
  description: string;
  readmePath: string;
}

@Component({
  selector: 'app-documentation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './documentation.component.html',
  styleUrls: ['./documentation.component.scss'],
})
export class DocumentationComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  packages: DocPackage[] = [
    {
      id: 'core',
      name: '@signaltree/core',
      description: 'Foundation package for SignalTree',
      readmePath: 'assets/docs/core/README.md',
    },
    {
      id: 'ng-forms',
      name: '@signaltree/ng-forms',
      description: 'Angular Forms integration',
      readmePath: 'assets/docs/ng-forms/README.md',
    },
    {
      id: 'enterprise',
      name: '@signaltree/enterprise',
      description: 'Enterprise features and audit logging',
      readmePath: 'assets/docs/enterprise/README.md',
    },
    {
      id: 'guardrails',
      name: '@signaltree/guardrails',
      description: 'Development-only performance guardrails',
      readmePath: 'assets/docs/guardrails/README.md',
    },
    {
      id: 'callable-syntax',
      name: '@signaltree/callable-syntax',
      description: 'Build-time transform for callable syntax',
      readmePath: 'assets/docs/callable-syntax/README.md',
    },
  ];

  selectedPackage = signal<DocPackage>(this.packages[0]);
  markdownContent = signal<string>('');
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor() {
    // Register languages for syntax highlighting
    hljs.registerLanguage('typescript', typescript);
    hljs.registerLanguage('javascript', javascript);
    hljs.registerLanguage('json', json);
    hljs.registerLanguage('bash', bash);

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  ngOnInit() {
    // Check if there's a package query parameter
    this.route.queryParams.subscribe((params) => {
      const packageId = params['package'];
      if (packageId) {
        const pkg = this.packages.find((p) => p.id === packageId);
        if (pkg) {
          this.selectPackage(pkg);
          return;
        }
      }
      // Default to first package
      this.loadReadme(this.selectedPackage());
    });
  }

  selectPackage(pkg: DocPackage) {
    this.selectedPackage.set(pkg);
    this.loadReadme(pkg);
  }

  private async loadReadme(pkg: DocPackage) {
    this.loading.set(true);
    this.error.set(null);

    try {
      const markdown = await lastValueFrom(
        this.http.get(pkg.readmePath, { responseType: 'text' })
      );

      if (!markdown) {
        this.markdownContent.set('');
        return;
      }

      const html = await marked.parse(markdown);
      this.markdownContent.set(this.highlightCodeBlocks(html));
    } catch (err) {
      console.error('Error loading README:', err);
      this.error.set(`Failed to load documentation for ${pkg.name}`);
      this.markdownContent.set('');
    } finally {
      this.loading.set(false);
    }
  }

  private highlightCodeBlocks(html: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const codeBlocks = Array.from(tempDiv.querySelectorAll('pre code'));
    for (const block of codeBlocks) {
      const codeElement = block as HTMLElement;
      const languageMatch = /language-(\w+)/.exec(codeElement.className);
      const language = languageMatch?.[1];

      try {
        if (language && hljs.getLanguage(language)) {
          codeElement.innerHTML = hljs.highlight(
            codeElement.textContent || '',
            {
              language,
            }
          ).value;
        } else {
          const result = hljs.highlightAuto(codeElement.textContent || '');
          codeElement.innerHTML = result.value;
        }
        codeElement.classList.add('hljs');
      } catch (error) {
        console.warn('Could not highlight code block:', error);
      }
    }

    return tempDiv.innerHTML;
  }
}
