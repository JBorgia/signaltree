import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { derivedFrom, entityMap, signalTree, WithDerived } from '@signaltree/core';

// =============================================================================
// EXAMPLE 1: INLINE DERIVED (Simple - Types inferred automatically)
// =============================================================================

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  active: boolean;
}

/**
 * When derived functions are INLINE, TypeScript infers everything automatically.
 * No special utilities needed - this is the simplest approach for small trees.
 */
function createInlineTree() {
  return signalTree({
    users: entityMap<User, number>(),
    selectedUserId: null as number | null,
  })
    .derived(($) => ({
      // Tier 1: Entity resolution
      selectedUser: computed(() => {
        const id = $.selectedUserId();
        return id != null ? $.users.byId(id)?.() ?? null : null;
      }),
    }))
    .derived(($) => ({
      // Tier 2: Complex logic - $.selectedUser is available and typed!
      isAdmin: computed(() => $.selectedUser()?.role === 'admin'),
      displayName: computed(() => {
        const user = $.selectedUser();
        return user ? `${user.name} (${user.email})` : 'No user selected';
      }),
    }));
}

// =============================================================================
// EXAMPLE 2: EXTERNAL DERIVED (Modular - Requires explicit typing)
// =============================================================================

/**
 * For larger applications, you may want to organize derived tiers into separate
 * files. This requires explicit typing because TypeScript cannot infer types
 * across file boundaries.
 *
 * Use these utilities:
 * - derivedFrom<TTree>() - Provides type context for the $ parameter
 * - WithDerived<TTree, TDerivedFn> - Builds intermediate tree types
 */

// Step 1: Define base state factory
function createExternalBaseState() {
  return {
    products: entityMap<Product, number>(),
    cart: {
      items: [] as CartItem[],
    },
    selectedProductId: null as number | null,
  };
}

// Step 2: Define base tree type using ReturnType
type ExternalTreeBase = ReturnType<
  typeof signalTree<ReturnType<typeof createExternalBaseState>>
>;

// Step 3: Define derived tier functions using derivedFrom
// NOTE: These would normally be in separate files!
// derivedFrom uses curried syntax: derivedFrom<TreeType>()(fn)

const entityResolutionDerived = derivedFrom<ExternalTreeBase>()(($) => ({
  selectedProduct: computed(() => {
    const id = $.selectedProductId();
    return id != null ? $.products.byId(id)?.() ?? null : null;
  }),
  cartTotal: computed(() => {
    return $.cart
      .items()
      .reduce(
        (sum: number, item: CartItem) => sum + item.price * item.quantity,
        0
      );
  }),
}));

// Step 4: Build intermediate type for next tier
type TreeWithTier1 = WithDerived<
  ExternalTreeBase,
  typeof entityResolutionDerived
>;

const complexLogicDerived = derivedFrom<TreeWithTier1>()(($) => ({
  // Can access $.selectedProduct from Tier 1!
  isSelectedInCart: computed(() => {
    const product = $.selectedProduct();
    if (!product) return false;
    return $.cart
      .items()
      .some((item: CartItem) => item.productId === product.id);
  }),
  formattedTotal: computed(() => {
    return `$${$.cartTotal().toFixed(2)}`;
  }),
}));

// Step 5: Assemble the tree
function createExternalTree() {
  return signalTree(createExternalBaseState())
    .derived(entityResolutionDerived)
    .derived(complexLogicDerived);
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

// =============================================================================
// DEMO COMPONENT
// =============================================================================

@Component({
  selector: 'app-derived-tiers-example',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="example-container">
      <h2>Derived Tiers Example</h2>

      <section class="example-section">
        <h3>Example 1: Inline Derived (Simple)</h3>
        <p class="description">
          When derived functions are inline, TypeScript automatically infers all
          types. This is the simplest approach for smaller state trees.
        </p>

        <div class="demo-area">
          <div class="users-list">
            <h4>Users</h4>
            @for (user of users(); track user.id) {
            <button
              [class.selected]="user.id === inlineTree.$.selectedUserId()"
              (click)="selectUser(user.id)"
            >
              {{ user.name }} ({{ user.role }})
            </button>
            }
          </div>

          <div class="selection-info">
            <p><strong>Selected:</strong> {{ displayName() }}</p>
            <p><strong>Is Admin:</strong> {{ isAdmin() ? 'Yes' : 'No' }}</p>
          </div>
        </div>
      </section>

      <section class="example-section">
        <h3>Example 2: External Derived (Modular)</h3>
        <p class="description">
          For larger apps, organize derived tiers into separate files. Use
          <code>derivedFrom&lt;TTree&gt;</code> for type safety.
        </p>

        <div class="demo-area">
          <div class="products-list">
            <h4>Products</h4>
            @for (product of products(); track product.id) {
            <div class="product-item">
              <span>{{ product.name }} - \${{ product.price }}</span>
              <button (click)="selectProduct(product.id)">Select</button>
              <button (click)="addToCart(product)">Add to Cart</button>
            </div>
            }
          </div>

          <div class="cart-info">
            <p>
              <strong>Selected Product:</strong> {{ selectedProductName() }}
            </p>
            <p>
              <strong>In Cart:</strong> {{ isSelectedInCart() ? 'Yes' : 'No' }}
            </p>
            <p><strong>Cart Total:</strong> {{ formattedTotal() }}</p>
          </div>
        </div>
      </section>

      <section class="code-note">
        <h4>💡 Key Point</h4>
        <p>
          <code>derivedFrom</code> is
          <strong>only needed for functions defined in separate files</strong>.
          Inline functions automatically inherit types from the chain.
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      .example-container {
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }

      .example-section {
        margin: 1.5rem 0;
        padding: 1rem;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
      }

      .description {
        color: #666;
        margin-bottom: 1rem;
      }

      .demo-area {
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
      }

      .users-list button,
      .product-item button {
        display: block;
        margin: 0.25rem 0;
        padding: 0.5rem 1rem;
        cursor: pointer;
      }

      .users-list button.selected {
        background: #4a90d9;
        color: white;
      }

      .product-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin: 0.5rem 0;
      }

      .selection-info,
      .cart-info {
        padding: 1rem;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .code-note {
        background: #fffde7;
        padding: 1rem;
        border-radius: 4px;
        border-left: 4px solid #ffc107;
      }

      code {
        background: #e8e8e8;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-family: monospace;
      }
    `,
  ],
})
export class DerivedTiersExampleComponent {
  // Example 1: Inline tree
  readonly inlineTree = createInlineTree();

  // Example 2: External tree
  readonly externalTree = createExternalTree();

  // Sample data
  private readonly sampleUsers: User[] = [
    {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      role: 'admin',
      active: true,
    },
    {
      id: 2,
      name: 'Bob',
      email: 'bob@example.com',
      role: 'user',
      active: true,
    },
    {
      id: 3,
      name: 'Charlie',
      email: 'charlie@example.com',
      role: 'guest',
      active: false,
    },
  ];

  private readonly sampleProducts: Product[] = [
    { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics' },
    { id: 2, name: 'Mouse', price: 29.99, category: 'Electronics' },
    { id: 3, name: 'Keyboard', price: 79.99, category: 'Electronics' },
  ];

  constructor() {
    // Initialize data
    this.inlineTree.$.users.setAll(this.sampleUsers);
    this.externalTree.$.products.setAll(this.sampleProducts);
  }

  // Expose signals for template
  readonly users = computed(() => this.inlineTree.$.users.all());
  readonly displayName = this.inlineTree.$.displayName;
  readonly isAdmin = this.inlineTree.$.isAdmin;

  readonly products = computed(() => this.externalTree.$.products.all());
  readonly selectedProductName = computed(
    () => this.externalTree.$.selectedProduct()?.name ?? 'None'
  );
  readonly isSelectedInCart = this.externalTree.$.isSelectedInCart;
  readonly formattedTotal = this.externalTree.$.formattedTotal;

  // Actions
  selectUser(id: number) {
    this.inlineTree.$.selectedUserId.set(id);
  }

  selectProduct(id: number) {
    this.externalTree.$.selectedProductId.set(id);
  }

  addToCart(product: Product) {
    this.externalTree.$.cart.items.update((items) => [
      ...items,
      {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
      },
    ]);
  }
}
