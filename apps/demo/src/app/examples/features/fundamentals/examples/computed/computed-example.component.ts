import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

@Component({
  selector: 'app-computed-example',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './computed-example.component.html',
  styleUrls: ['./computed-example.component.scss'],
})
export class ComputedExampleComponent {
  // Input properties
  basePrice = 100;
  taxRate = 0.08;
  discountPercent = 0;

  // Basic signals
  counter = signal(5);
  multiplier = signal(2);

  // Computed values
  doubleCounter = computed(() => this.counter() * 2);
  isEven = computed(() => this.counter() % 2 === 0);
  counterDescription = computed(() =>
    this.counter() === 0 ? 'Zero' : this.counter() > 0 ? 'Positive' : 'Negative'
  );

  // Shopping cart example
  cartItems = signal([
    { name: 'Laptop', price: 999, quantity: 1 },
    { name: 'Mouse', price: 25, quantity: 2 },
    { name: 'Keyboard', price: 75, quantity: 1 },
  ]);

  subtotal = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  tax = computed(() => this.subtotal() * this.taxRate);
  discount = computed(() => this.subtotal() * (this.discountPercent / 100));
  total = computed(() => this.subtotal() + this.tax() - this.discount());

  // SignalTree with computed values
  tree = signalTree({
    user: { firstName: 'John', lastName: 'Doe', age: 30 },
    preferences: { language: 'en' },
  });

  // Reactive access to tree state
  user = this.tree.state.user;

  fullName = computed(() => `${this.user().firstName} ${this.user().lastName}`);

  displayName = computed(() => `${this.fullName()}, Age: ${this.user().age}`);

  // Methods
  increment() {
    this.counter.update((c) => c + 1);
  }

  decrement() {
    this.counter.update((c) => c - 1);
  }

  updateMultiplier(value: number) {
    this.multiplier.set(value);
  }

  addCartItem() {
    if (!this.newItemName?.trim() || this.newItemPrice <= 0) return;

    this.cartItems.update((items) => [
      ...items,
      {
        name: this.newItemName.trim(),
        price: this.newItemPrice,
        quantity: this.newItemQuantity,
      },
    ]);

    this.newItemName = '';
    this.newItemPrice = 0;
    this.newItemQuantity = 1;
  }

  updateUser(firstName: string, lastName: string) {
    this.tree.state.user({
      ...this.user(),
      firstName,
      lastName,
    });
  }

  // Form inputs
  newItemName = '';
  newItemPrice = 0;
  newItemQuantity = 1;
  userFirstName = '';
  userLastName = '';

  // TrackBy functions
  trackByItemName(
    index: number,
    item: { name: string; price: number; quantity: number }
  ): string {
    return item.name;
  }
}
