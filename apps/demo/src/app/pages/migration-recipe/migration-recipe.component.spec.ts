import { TestBed } from '@angular/core/testing';

import { MigrationRecipeComponent } from './migration-recipe.component';

describe('MigrationRecipeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MigrationRecipeComponent],
    }).compileComponents();
  });

  it('renders heading', () => {
    const fixture = TestBed.createComponent(MigrationRecipeComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Migration Recipe: NgRx to SignalTree'
    );
  });
});
