# Angular Signal Store

An Angular 16+ store built around Signals designed for simplicity and ease of use. This store leverages Angular's `Signal` functionality to manage state in a straightforward way.

## Features

- **Simplicity**: No selectors, actions, or reducers are required.
- **Type Safety**: All fields must be typed, with undefined values allowed.
- **Recursive Initialization**: Automatically constructs nested `SignalStore` structures.

## Getting Started

### Installation

To use this store, ensure you have Angular 16+ and the required dependencies installed. Then, import the `signalStore()` function and pass it an object representing the initial state of the store.

### Usage

1. **Create a Store**:
   ```typescript
   import { signalStore } from 'your-library';

   const initialState = {
     user: {
       name: 'John Doe',
       age: 30
     },
     settings: {
       theme: 'dark'
     }
   };

   const store = signalStore(initialState);
   ```

2. **Accessing Values**:
   Use the `unwrap()` method to get the current plain object representation of the store.
   ```typescript
   const currentState = store.unwrap();
   console.log(currentState.user.name); // Output: 'John Doe'
   ```

3. **Updating Values**:
   Use the `update()` method to modify the store's state. This method allows you to apply partial updates to the store. For example:
   ```typescript
   store.update({
     user: { age: 31 },
     settings: { theme: 'light' }
   });
   ```

## Key Considerations

- **Type Application**: Ensure all fields are initialized and properly typed. Fields cannot be optional (`?`), but `Partial<>` can be used for updates.
- **Deep Initialization**: `signalStore()` will recursively build out the store for nested objects. To prevent a nested object from being wrapped in another `Signal`, make it a `WritableSignal` directly.
- **Signal Wrapping**: The function will not wrap a `Signal` within another `Signal`. Ensure the terminal value is a signal if needed.

## Instructions and Warnings

1. **Recursive Wrapping**: This utility recursively wraps each field into `SignalStores`. It is best suited for simple objects without self-referenced fields. Avoid using it for complex structures like ArcGIS Layers and Objects.

2. **Signal Functionality**: To utilize deep equality checks similar to the `equal()` function, use the 'terminal' function from the store or create a custom `equal()` function to ensure proper emissions when changes occur.

3. **Store Mutability**: The store's shape cannot be altered once created. Fields cannot be added or removed, though values within existing fields can be updated. Types used in the store must be non-optional.

## Example

See the `example.ts` file for detailed examples on handling unknown value initialization and other use cases.
