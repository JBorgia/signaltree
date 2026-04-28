import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MigrationRecipeComponent } from './migration-recipe.component';

describe('MigrationRecipeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MigrationRecipeComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders heading', () => {
    const fixture = TestBed.createComponent(MigrationRecipeComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Migrating to SignalTree'
    );
  });

  it('covers multiple source libraries', () => {
    const fixture = TestBed.createComponent(MigrationRecipeComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('@ngrx/signals');
    expect(text).toContain('Classic NgRx');
    expect(text).toContain('NGXS');
    expect(text).toContain('Elf');
    expect(text).toContain('BehaviorSubject');
    expect(text).toContain('AI-assisted migration');
  });
});
