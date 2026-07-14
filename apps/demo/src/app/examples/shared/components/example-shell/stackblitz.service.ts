import sdk from '@stackblitz/sdk';

import { Injectable } from '@angular/core';

import type { StackblitzConfig } from './example.types';

/**
 * Opens a runnable, editable StackBlitz sandbox for a demo — the "Edit like a
 * playground" affordance. Demos supply their own source via
 * {@link StackblitzConfig.files} (at minimum `src/app/app.component.ts`); this
 * service wraps them in one shared, standalone-Angular + `@signaltree/core`
 * project template so every "Edit" button boots the same known-good app.
 *
 * NOTE: the template targets a modern standalone Angular app (v20). Multi-file
 * store demos should project a self-contained single-file version; the base
 * template is centralized here so it only needs tuning in one place.
 */
@Injectable({ providedIn: 'root' })
export class StackblitzService {
  /** Angular version line the sandbox pins to (kept close to the demo app). */
  private readonly ngVersion = '^20.3.0';

  open(config: StackblitzConfig): void {
    const files = { ...this.baseFiles(), ...config.files };
    sdk.openProject(
      {
        title: config.title,
        description: config.description ?? config.title,
        template: 'node',
        files,
      },
      {
        newWindow: true,
        openFile: config.openFile ?? 'src/app/app.component.ts',
      }
    );
  }

  /** The shared, runnable standalone-Angular scaffold every sandbox starts from. */
  private baseFiles(): Record<string, string> {
    return {
      'package.json': JSON.stringify(
        {
          name: 'signaltree-example',
          private: true,
          scripts: { start: 'ng serve', build: 'ng build' },
          dependencies: {
            '@angular/common': this.ngVersion,
            '@angular/compiler': this.ngVersion,
            '@angular/core': this.ngVersion,
            '@angular/forms': this.ngVersion,
            '@angular/platform-browser': this.ngVersion,
            '@angular/router': this.ngVersion,
            '@signaltree/core': 'latest',
            rxjs: '^7.8.0',
            tslib: '^2.6.0',
            'zone.js': '^0.15.0',
          },
          devDependencies: {
            '@angular/build': this.ngVersion,
            '@angular/cli': this.ngVersion,
            '@angular/compiler-cli': this.ngVersion,
            typescript: '^5.8.0',
          },
        },
        null,
        2
      ),
      'angular.json': JSON.stringify(
        {
          version: 1,
          projects: {
            app: {
              projectType: 'application',
              root: '',
              sourceRoot: 'src',
              architect: {
                build: {
                  builder: '@angular/build:application',
                  options: {
                    outputPath: 'dist',
                    index: 'src/index.html',
                    browser: 'src/main.ts',
                    tsConfig: 'tsconfig.app.json',
                    styles: ['src/styles.css'],
                  },
                },
                serve: { builder: '@angular/build:dev-server', options: {} },
              },
            },
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify(
        {
          compileOnSave: false,
          compilerOptions: {
            strict: true,
            experimentalDecorators: true,
            moduleResolution: 'bundler',
            importHelpers: true,
            target: 'ES2022',
            module: 'ES2022',
            lib: ['ES2022', 'dom'],
          },
        },
        null,
        2
      ),
      'tsconfig.app.json': JSON.stringify(
        {
          extends: './tsconfig.json',
          compilerOptions: { outDir: './out-tsc/app' },
          files: ['src/main.ts'],
        },
        null,
        2
      ),
      'src/main.ts': `import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((err) => console.error(err));
`,
      'src/index.html': `<app-root></app-root>`,
      'src/styles.css': `body { font-family: system-ui, sans-serif; margin: 2rem; }`,
      // Sensible placeholder; demos override src/app/app.component.ts.
      'src/app/app.component.ts': `import { Component } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: \`<h1>SignalTree playground</h1><p>Count: {{ tree.$.count() }}</p>
    <button (click)="tree.$.count.update((n) => n + 1)">+1</button>\`,
})
export class AppComponent {
  tree = signalTree({ count: 0 });
}
`,
    };
  }
}
