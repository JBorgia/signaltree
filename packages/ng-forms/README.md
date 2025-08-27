# @signaltree/ng-forms

Angular Forms integration for SignalTree featuring reactive forms binding, validation, form state management, and seamless Angular integration.

## ✨ What is @signaltree/ng-forms?

The ng-forms package provides deep Angular Forms integration:

- **Reactive Forms binding** with automatic synchronization
- **Template-driven forms** support with signals
- **Advanced validation** with real-time feedback
- **Form state management** (dirty, touched, valid states)
- **Dynamic form generation** from SignalTree state
- **Cross-field validation** and complex form logic

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/ng-forms
```

## 📖 Basic Usage

```typescript
import { createFormTree, SIGNAL_FORM_DIRECTIVES } from '@signaltree/ng-forms';

// Build a form-specific tree from plain initial values
const form = createFormTree(
  {
    user: { name: '', email: '', age: 0 },
    preferences: { newsletter: false, theme: 'light' },
  },
  {
    validators: {
      'user.email': (v) => (typeof v === 'string' && v.includes('@') ? null : 'Invalid email'),
    },
  }
);

// Use in Angular components with the provided directive
@Component({
  selector: 'user-form',
  standalone: true,
  imports: [...SIGNAL_FORM_DIRECTIVES],
  template: `
    <input [signalTreeSignalValue]="form.$.user.name" />
    <div class="error">{{ form.getFieldError('user.email')() }}</div>
    <button (click)="onSubmit()" [disabled]="!form.valid() || form.submitting()">Submit</button>
  `,
})
export class UserFormComponent {
  form = form;
  onSubmit() {
    form.submit(async (values) => await api.save(values));
  }
}
```

## 🎯 Core Features

### Signal-bound Inputs (Directive)

```typescript
import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

@Component({
  template: `
    <form [formGroup]="userForm" (ngSubmit)="onSubmit()">
      <!-- Form automatically synced with SignalTree -->
      <input formControlName="name" placeholder="Name" />
      <input formControlName="email" placeholder="Email" />
      <input formControlName="age" type="number" placeholder="Age" />

      <button type="submit" [disabled]="userForm.invalid">Submit</button>
    </form>

    <!-- Real-time state display -->
    <div>
      <p>Current State: {{ tree.$.user() | json }}</p>
      <p>Form Valid: {{ userForm.valid }}</p>
      <p>Form Dirty: {{ userForm.dirty }}</p>
    </div>
  `,
})
class UserFormComponent {
  form = createFormTree({ user: { name: '', email: '', age: 0 } });

  onSubmit() {
    if (this.userForm.valid) {
      console.log('Form Data:', this.tree.$.user());
      console.log('Form Value:', this.userForm.value);
      // Both are automatically synchronized!
    }
  }
}
```

### Template-Driven Forms (manual binding)

```typescript
@Component({
  template: `
    <form #userForm="ngForm" (ngSubmit)="onSubmit(userForm)">
      <!-- Bind directly to SignalTree signals -->
      <input name="name" ngModel [ngModel]="tree.$.user.name()" (ngModelChange)="tree.$.user.name.set($event)" #name="ngModel" required minlength="2" />
      <div *ngIf="name.invalid && name.touched">Name is required (min 2 characters)</div>

      <input name="email" type="email" ngModel [ngModel]="tree.$.user.email()" (ngModelChange)="tree.$.user.email.set($event)" #email="ngModel" required email />
      <div *ngIf="email.invalid && email.touched">Valid email is required</div>

      <button type="submit" [disabled]="userForm.invalid">Submit</button>
    </form>
  `,
})
class TemplateFormComponent {
  form = createFormTree({ user: { name: '', email: '' } });

  onSubmit(form: NgForm) {
    if (form.valid) {
      console.log('User Data:', this.tree.$.user());
    }
  }
}
```

### Advanced Validation

```typescript
const tree = signalTree({
  registration: {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  },
);

// Custom validators that can access SignalTree state
const usernameAsyncValidator = (control: AbstractControl) => {
  return of(control.value).pipe(
    delay(300), // Debounce
    switchMap((username) =>
      // Check if username exists (can access tree state)
      this.userService.checkUsernameAvailability(username)
    ),
    map((isAvailable) => (isAvailable ? null : { usernameTaken: true }))
  );
};

const passwordMatchValidator = (group: AbstractControl) => {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
};

// Register validators using createFormTree's config
const registration = createFormTree(
  {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  },
  {
    validators: {
      username: (v) => (typeof v === 'string' && v.length >= 3 ? null : 'Username too short'),
      email: (v) => (typeof v === 'string' && Validators.email(new FormControl(v)) == null ? null : 'Invalid email'),
    },
    asyncValidators: {
      username: usernameAsyncValidator,
    },
  }
);

// Real-time validation feedback
@Component({
  template: `
    <form [formGroup]="registrationForm" (ngSubmit)="onSubmit()">
      <div class="field">
        <input formControlName="username" placeholder="Username" />
        <div class="validation-messages">
          @if (registrationForm.get('username')?.hasError('required')) {
          <span class="error">Username is required</span>
          } @if (registrationForm.get('username')?.hasError('minlength')) {
          <span class="error">Username must be at least 3 characters</span>
          } @if (registrationForm.get('username')?.hasError('usernameTaken')) {
          <span class="error">Username is already taken</span>
          } @if (registrationForm.get('username')?.pending) {
          <span class="checking">Checking availability...</span>
          }
        </div>
      </div>

      <div class="field">
        <input formControlName="password" type="password" placeholder="Password" />
        <div class="validation-messages">
          @if (registrationForm.get('password')?.hasError('required')) {
          <span class="error">Password is required</span>
          } @if (registrationForm.get('password')?.hasError('minlength')) {
          <span class="error">Password must be at least 8 characters</span>
          }
        </div>
      </div>

      <div class="field">
        <input formControlName="confirmPassword" type="password" placeholder="Confirm Password" />
        <div class="validation-messages">
          @if (registrationForm.hasError('passwordMismatch')) {
          <span class="error">Passwords don't match</span>
          }
        </div>
      </div>

      <label>
        <input formControlName="agreeToTerms" type="checkbox" />
        I agree to the terms and conditions
      </label>

      <button type="submit" [disabled]="registrationForm.invalid">Register</button>
    </form>
  `,
})
class RegistrationComponent {
  registrationForm = registrationForm;

  onSubmit() {
    if (this.registrationForm.valid) {
      console.log('Registration Data:', tree.$.registration());
    }
  }
}
```

### Dynamic Form Generation

```typescript
interface FormField {
  name: string;
  type: 'text' | 'email' | 'number' | 'checkbox' | 'select';
  label: string;
  required?: boolean;
  options?: Array<{ value: any; label: string }>;
  validators?: any[];
}

const tree = signalTree({
  dynamicData: {} as Record<string, any>,
  formConfig: {
    fields: [] as FormField[],
  },
});

@Injectable()
class DynamicFormService {
  generateForm(fields: FormField[]) {
    const formConfig: Record<string, any> = {};

    fields.forEach((field) => {
      const validators = [];
      if (field.required) validators.push(Validators.required);
      if (field.type === 'email') validators.push(Validators.email);

      formConfig[field.name] = ['', validators];
    });

    // Build a form using createFormTree directly from the dynamic config
    return createFormTree(tree.$.dynamicData(), {});
  }
}

@Component({
  template: `
    <form [formGroup]="dynamicForm" (ngSubmit)="onSubmit()">
      @for (field of formFields(); track field.name) {
      <div class="field">
        <label>{{ field.label }}</label>

        @switch (field.type) { @case ('text') {
        <input [formControlName]="field.name" type="text" />
        } @case ('email') {
        <input [formControlName]="field.name" type="email" />
        } @case ('number') {
        <input [formControlName]="field.name" type="number" />
        } @case ('checkbox') {
        <input [formControlName]="field.name" type="checkbox" />
        } @case ('select') {
        <select [formControlName]="field.name">
          @for (option of field.options; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
        } }

        <div class="validation-messages">
          @if (dynamicForm.get(field.name)?.invalid && dynamicForm.get(field.name)?.touched) {
          <span class="error">{{ field.label }} is invalid</span>
          }
        </div>
      </div>
      }

      <button type="submit" [disabled]="dynamicForm.invalid">Submit</button>
    </form>
  `,
})
class DynamicFormComponent {
  formFields = computed(() => tree.$.formConfig.fields());
  dynamicForm = this.dynamicFormService.generateForm(this.formFields());

  constructor(private dynamicFormService: DynamicFormService) {}

  onSubmit() {
    if (this.dynamicForm.valid) {
      console.log('Dynamic Form Data:', tree.$.dynamicData());
    }
  }
}
```

## 🔧 Advanced Configuration

```typescript
// Create a form tree with custom validators and async validators
const form = createFormTree(
  {
    password: '',
    confirmPassword: '',
  },
  {
    validators: {
      password: (v) => (typeof v === 'string' && v.length >= 8 ? null : 'Min 8 chars'),
      confirmPassword: (v) => (v === form.$.password() ? null : "Passwords don't match"),
    },
  }
);
```

## 📊 Real-World Examples

### Multi-Step Form Wizard

```typescript
interface WizardState {
  currentStep: number;
  steps: {
    personal: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    preferences: {
      newsletter: boolean;
      notifications: boolean;
      theme: 'light' | 'dark';
    };
  };
  validation: {
    personalValid: boolean;
    addressValid: boolean;
    preferencesValid: boolean;
  };
}

const wizardTree = signalTree<WizardState>({
  currentStep: 1,
  steps: {
    personal: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
    },
    preferences: {
      newsletter: false,
      notifications: true,
      theme: 'light',
    },
  },
  validation: {
    personalValid: false,
    addressValid: false,
    preferencesValid: false,
  },
});

@Component({
  template: `
    <div class="wizard">
      <div class="wizard-steps">
        @for (step of steps; track step.number) {
        <div class="step" [class.active]="currentStep() === step.number" [class.completed]="isStepCompleted(step.number)">
          {{ step.title }}
        </div>
        }
      </div>

      <div class="wizard-content">
        @switch (currentStep()) { @case (1) {
        <form [formGroup]="personalForm">
          <h2>Personal Information</h2>
          <input formControlName="firstName" placeholder="First Name" />
          <input formControlName="lastName" placeholder="Last Name" />
          <input formControlName="email" placeholder="Email" />
          <input formControlName="phone" placeholder="Phone" />
        </form>
        } @case (2) {
        <form [formGroup]="addressForm">
          <h2>Address Information</h2>
          <input formControlName="street" placeholder="Street Address" />
          <input formControlName="city" placeholder="City" />
          <input formControlName="state" placeholder="State" />
          <input formControlName="zipCode" placeholder="ZIP Code" />
        </form>
        } @case (3) {
        <form [formGroup]="preferencesForm">
          <h2>Preferences</h2>
          <label>
            <input formControlName="newsletter" type="checkbox" />
            Subscribe to newsletter
          </label>
          <label>
            <input formControlName="notifications" type="checkbox" />
            Enable notifications
          </label>
          <select formControlName="theme">
            <option value="light">Light Theme</option>
            <option value="dark">Dark Theme</option>
          </select>
        </form>
        } }
      </div>

      <div class="wizard-navigation">
        <button (click)="previousStep()" [disabled]="currentStep() === 1">Previous</button>

        @if (currentStep() < 3) {
        <button (click)="nextStep()" [disabled]="!canProceed()">Next</button>
        } @else {
        <button (click)="submitWizard()" [disabled]="!allStepsValid()">Submit</button>
        }
      </div>
    </div>
  `,
})
class WizardComponent {
  wizardTree = wizardTree;
  currentStep = computed(() => this.wizardTree.$.currentStep());

  steps = [
    { number: 1, title: 'Personal' },
    { number: 2, title: 'Address' },
    { number: 3, title: 'Preferences' },
  ];

  // Create forms for each step
  personalForm = createFormTree(this.wizardTree.$.steps.personal(), {
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
  });

  addressForm = createFormTree(this.wizardTree.$.steps.address(), {
    street: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', Validators.required],
    zipCode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
  });

  preferencesForm = createFormTree(this.wizardTree.$.steps.preferences(), {});

  // Track form validity
  constructor() {
    // Update validation state when forms change
    effect(() => {
      this.wizardTree.$.validation.personalValid.set(this.personalForm.valid);
      this.wizardTree.$.validation.addressValid.set(this.addressForm.valid);
      this.wizardTree.$.validation.preferencesValid.set(this.preferencesForm.valid);
    });
  }

  nextStep() {
    if (this.canProceed()) {
      this.wizardTree.$.currentStep.update((step) => step + 1);
    }
  }

  previousStep() {
    this.wizardTree.$.currentStep.update((step) => Math.max(1, step - 1));
  }

  canProceed(): boolean {
    const step = this.currentStep();
    const validation = this.wizardTree.$.validation();

    switch (step) {
      case 1:
        return validation.personalValid;
      case 2:
        return validation.addressValid;
      case 3:
        return validation.preferencesValid;
      default:
        return false;
    }
  }

  isStepCompleted(stepNumber: number): boolean {
    const validation = this.wizardTree.$.validation();
    switch (stepNumber) {
      case 1:
        return validation.personalValid;
      case 2:
        return validation.addressValid;
      case 3:
        return validation.preferencesValid;
      default:
        return false;
    }
  }

  allStepsValid(): boolean {
    const validation = this.wizardTree.$.validation();
    return validation.personalValid && validation.addressValid && validation.preferencesValid;
  }

  submitWizard() {
    if (this.allStepsValid()) {
      const wizardData = this.wizardTree.$.steps();
      console.log('Wizard completed:', wizardData);
      // Submit to API
    }
  }
}
```

### Dynamic Survey Builder

```typescript
interface Question {
  id: string;
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox';
  label: string;
  required: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface Survey {
  id: string;
  title: string;
  questions: Question[];
}

interface SurveyResponse {
  surveyId: string;
  responses: Record<string, any>;
  submittedAt?: Date;
}

const surveyTree = signalTree({
  survey: null as Survey | null,
  responses: {} as Record<string, any>,
  currentQuestion: 0,
  isSubmitting: false,
  submitError: null as string | null,
});

@Component({
  template: `
    <div class="survey" *ngIf="survey()">
      <h1>{{ survey()!.title }}</h1>

      <div class="progress">
        <div class="progress-bar" [style.width.%]="progressPercent()"></div>
      </div>

      <form [formGroup]="surveyForm" (ngSubmit)="submitSurvey()">
        @for (question of survey()!.questions; track question.id; let i = $index) {
        <div class="question" [class.active]="currentQuestion() === i">
          <h3>{{ question.label }}</h3>

          @switch (question.type) { @case ('text') {
          <input [formControlName]="question.id" type="text" [placeholder]="question.label" />
          } @case ('number') {
          <input [formControlName]="question.id" type="number" [min]="question.validation?.min" [max]="question.validation?.max" />
          } @case ('select') {
          <select [formControlName]="question.id">
            <option value="">Select an option</option>
            @for (option of question.options; track option) {
            <option [value]="option">{{ option }}</option>
            }
          </select>
          } @case ('radio') { @for (option of question.options; track option) {
          <label>
            <input [formControlName]="question.id" type="radio" [value]="option" />
            {{ option }}
          </label>
          } } @case ('checkbox') { @for (option of question.options; track option) {
          <label>
            <input type="checkbox" [value]="option" (change)="onCheckboxChange(question.id, option, $event)" />
            {{ option }}
          </label>
          } } }

          <div class="validation-error" *ngIf="getQuestionError(question.id)">
            {{ getQuestionError(question.id) }}
          </div>
        </div>
        }

        <div class="survey-navigation">
          <button type="button" (click)="previousQuestion()" [disabled]="currentQuestion() === 0">Previous</button>

          @if (currentQuestion() < survey()!.questions.length - 1) {
          <button type="button" (click)="nextQuestion()" [disabled]="!isCurrentQuestionValid()">Next</button>
          } @else {
          <button type="submit" [disabled]="surveyForm.invalid || isSubmitting()">
            {{ isSubmitting() ? 'Submitting...' : 'Submit Survey' }}
          </button>
          }
        </div>
      </form>

      <div class="error" *ngIf="submitError()">
        {{ submitError() }}
      </div>
    </div>
  `,
})
class SurveyComponent implements OnInit {
  surveyTree = surveyTree;
  surveyForm!: FormGroup;

  survey = computed(() => this.surveyTree.$.survey());
  currentQuestion = computed(() => this.surveyTree.$.currentQuestion());
  isSubmitting = computed(() => this.surveyTree.$.isSubmitting());
  submitError = computed(() => this.surveyTree.$.submitError());

  progressPercent = computed(() => {
    const survey = this.survey();
    const current = this.currentQuestion();
    if (!survey) return 0;
    return ((current + 1) / survey.questions.length) * 100;
  });

  ngOnInit() {
    // Load survey and create form
    this.loadSurvey().then((survey) => {
      this.surveyTree.$.survey.set(survey);
      this.createSurveyForm(survey);
    });
  }

  private createSurveyForm(survey: Survey) {
    const formConfig: Record<string, any> = {};

    survey.questions.forEach((question) => {
      const validators = [];

      if (question.required) {
        validators.push(Validators.required);
      }

      if (question.validation) {
        if (question.validation.min !== undefined) {
          validators.push(Validators.min(question.validation.min));
        }
        if (question.validation.max !== undefined) {
          validators.push(Validators.max(question.validation.max));
        }
        if (question.validation.pattern) {
          validators.push(Validators.pattern(question.validation.pattern));
        }
      }

      const defaultValue = question.type === 'checkbox' ? [] : '';
      formConfig[question.id] = [defaultValue, validators];
    });

    // Build a Reactive FormGroup here as needed; ng-forms focuses on signal binding helpers.
    this.surveyForm = new FormGroup({});
  }

  nextQuestion() {
    if (this.isCurrentQuestionValid()) {
      this.surveyTree.$.currentQuestion.update((q) => q + 1);
    }
  }

  previousQuestion() {
    this.surveyTree.$.currentQuestion.update((q) => Math.max(0, q - 1));
  }

  isCurrentQuestionValid(): boolean {
    const survey = this.survey();
    const current = this.currentQuestion();
    if (!survey) return false;

    const question = survey.questions[current];
    const control = this.surveyForm.get(question.id);
    return control ? control.valid : false;
  }

  getQuestionError(questionId: string): string | null {
    const control = this.surveyForm.get(questionId);
    if (control?.errors && control.touched) {
      if (control.errors['required']) return 'This question is required';
      if (control.errors['min']) return `Minimum value is ${control.errors['min'].min}`;
      if (control.errors['max']) return `Maximum value is ${control.errors['max'].max}`;
      if (control.errors['pattern']) return 'Invalid format';
    }
    return null;
  }

  onCheckboxChange(questionId: string, option: string, event: any) {
    const control = this.surveyForm.get(questionId);
    const currentValue = control?.value || [];

    if (event.target.checked) {
      control?.setValue([...currentValue, option]);
    } else {
      control?.setValue(currentValue.filter((v: string) => v !== option));
    }
  }

  async submitSurvey() {
    if (this.surveyForm.valid) {
      this.surveyTree.$.isSubmitting.set(true);
      this.surveyTree.$.submitError.set(null);

      try {
        const response: SurveyResponse = {
          surveyId: this.survey()!.id,
          responses: this.surveyTree.$.responses(),
          submittedAt: new Date(),
        };

        await this.submitSurveyResponse(response);
        console.log('Survey submitted successfully');
      } catch (error) {
        this.surveyTree.$.submitError.set('Failed to submit survey. Please try again.');
      } finally {
        this.surveyTree.$.isSubmitting.set(false);
      }
    }
  }

  private async loadSurvey(): Promise<Survey> {
    // Load survey from API
    return {
      id: '1',
      title: 'Customer Satisfaction Survey',
      questions: [
        {
          id: 'q1',
          type: 'radio',
          label: 'How satisfied are you with our service?',
          required: true,
          options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'],
        },
        {
          id: 'q2',
          type: 'text',
          label: 'What can we improve?',
          required: false,
        },
        {
          id: 'q3',
          type: 'number',
          label: 'Rate us from 1-10',
          required: true,
          validation: { min: 1, max: 10 },
        },
      ],
    };
  }

  private async submitSurveyResponse(response: SurveyResponse): Promise<void> {
    // Submit to API
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

## 🎯 When to Use ng-forms

Perfect for:

- ✅ Angular applications with complex forms
- ✅ Real-time form validation and feedback
- ✅ Multi-step forms and wizards
- ✅ Dynamic form generation
- ✅ Forms with cross-field validation
- ✅ Applications requiring form state persistence

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { createFormTree } from '@signaltree/ng-forms';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree(state).pipe(
  withDevTools() // Debug form state changes
);

// Build a form for a slice of tree state
const form = createFormTree(tree.$.profile(), {
  validators: { email: (v) => (typeof v === 'string' && v.includes('@') ? null : 'Invalid email') },
});
```

## 📈 Performance Benefits

- **Automatic synchronization** between forms and state
- **Debounced updates** prevent excessive state changes
- **Efficient validation** with minimal re-computation
- **Tree-shakeable** - only includes what you use
- **Memory efficient** form state management

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [ng-forms Examples](https://signaltree.io/examples/ng-forms)

## 📄 License

MIT License - see the [LICENSE](../../LICENSE) file for details.

---

**Seamless Angular Forms** with SignalTree power! 🅰️
