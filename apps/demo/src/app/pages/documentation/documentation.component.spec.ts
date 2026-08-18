import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DocumentationComponent } from './documentation.component';

/**
 * This page is a thin shell over package READMEs fetched at runtime via
 * HttpClient + marked — the actual documentation content lives in markdown
 * files, not in this component. Per review guidance, kept thin: a render
 * check, the package-selection interaction (pure signal logic, doesn't need
 * the HTTP response to have resolved), and the dead-link check for
 * quickLinks (covered by the shared route-links.spec.ts). HttpClientTesting
 * is provided so ngOnInit's real `HttpClient.get()` call is deterministic —
 * without it, the component would throw (no HttpClient provider) or, if a
 * real HttpClient were provided instead, attempt an actual fetch.
 */
describe('DocumentationComponent', () => {
  let component: DocumentationComponent;
  let fixture: ComponentFixture<DocumentationComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentationComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    // Drain whatever README fetch(es) the test triggered so no pending
    // request leaks into the next test.
    httpMock.match(() => true).forEach((req) => req.flush('# Stub\n'));
    httpMock.verify();
  });

  it('creates and defaults to the first package (core)', () => {
    expect(component).toBeTruthy();
    expect(component.selectedPackage().id).toBe('core');
  });

  it('renders one sidebar button per entry in packages, and one quick-link per entry in quickLinks', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.package-button');
    expect(buttons.length).toBe(component.packages.length);

    const links = fixture.nativeElement.querySelectorAll('.doc-quick-link');
    expect(links.length).toBe(component.quickLinks.length);
  });

  it('selectPackage() updates selectedPackage() and re-issues the README fetch for the new package', () => {
    const guardrailsPkg = component.packages.find(
      (p) => p.id === 'guardrails'
    );
    expect(guardrailsPkg).toBeDefined();

    component.selectPackage(guardrailsPkg!);

    expect(component.selectedPackage().id).toBe('guardrails');
    // expectOne removes the request from the pending queue, so it must be
    // flushed here rather than left for the afterEach's blanket drain.
    httpMock.expectOne(guardrailsPkg!.readmePath).flush('# Guardrails\n');
  });

  it('clicking a package button in the DOM drives the same selection', () => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.package-button')
    );
    const ngFormsIndex = component.packages.findIndex(
      (p) => p.id === 'ng-forms'
    );
    buttons[ngFormsIndex].click();
    fixture.detectChanges();

    expect(component.selectedPackage().id).toBe('ng-forms');
    expect(buttons[ngFormsIndex].classList.contains('active')).toBe(true);
  });
});
