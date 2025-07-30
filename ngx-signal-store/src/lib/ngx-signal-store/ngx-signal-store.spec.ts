import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgxSignalStore } from './ngx-signal-store';

describe('NgxSignalStore', () => {
  let component: NgxSignalStore;
  let fixture: ComponentFixture<NgxSignalStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxSignalStore],
    }).compileComponents();

    fixture = TestBed.createComponent(NgxSignalStore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
