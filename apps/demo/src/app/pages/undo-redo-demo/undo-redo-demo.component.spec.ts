import { TestBed } from '@angular/core/testing';
import { UndoRedoDemoComponent } from './undo-redo-demo.component';

describe('UndoRedoDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UndoRedoDemoComponent] }).compileComponents();
  });

  it('renders controls', () => {
    const fixture = TestBed.createComponent(UndoRedoDemoComponent);
    fixture.detectChanges();
    const btns = fixture.nativeElement.querySelectorAll('button');
    expect(btns.length).toBeGreaterThanOrEqual(3);
  });
});