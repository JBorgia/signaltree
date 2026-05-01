import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

export type CompareLib =
  | 'signals'
  | 'behavior'
  | 'ngrx-signals'
  | 'ngrx-classic'
  | 'component-store'
  | 'ngxs'
  | 'elf';

interface CompareOption {
  id: CompareLib;
  label: string;
  /** Examples (1-6) where this library has a side-by-side implementation. */
  available: number[];
}

@Component({
  selector: 'app-migration-recipe',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './migration-recipe.component.html',
  styleUrl: './migration-recipe.component.scss',
})
export class MigrationRecipeComponent {
  readonly options: CompareOption[] = [
    { id: 'ngrx-signals', label: '@ngrx/signals', available: [1, 2, 3, 4, 5, 6] },
    { id: 'signals', label: 'Plain signals', available: [1, 2] },
    { id: 'behavior', label: 'BehaviorSubject', available: [1, 2, 3] },
    { id: 'component-store', label: '@ngrx/component-store', available: [3] },
    { id: 'ngrx-classic', label: 'Classic NgRx', available: [4, 5] },
    { id: 'ngxs', label: 'NGXS', available: [2] },
    { id: 'elf', label: 'Elf', available: [4] },
  ];

  readonly compareLib = signal<CompareLib>('ngrx-signals');

  isAvailable(example: number, lib: CompareLib = this.compareLib()): boolean {
    return (
      this.options.find((o) => o.id === lib)?.available.includes(example) ?? false
    );
  }

  selectedLabel(): string {
    return this.options.find((o) => o.id === this.compareLib())?.label ?? '';
  }

  examplesFor(lib: CompareLib): number[] {
    return this.options.find((o) => o.id === lib)?.available ?? [];
  }
}
