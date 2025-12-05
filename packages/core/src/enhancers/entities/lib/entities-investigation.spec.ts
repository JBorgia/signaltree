import { signalTree } from '../../../lib/signal-tree';
import { withEntities } from './entities';

describe('Entities Investigation - Optional ID & Nested Paths', () => {
  describe('Issue 1: Optional ID constraint', () => {
    it('should fail with optional id (current behavior)', () => {
      interface Form {
        id?: number; // Optional ID - common pattern for DTOs
        name: string;
        data: string;
      }

      const tree = signalTree({
        forms: [] as Form[],
      }).with(withEntities());

      // This should fail TypeScript compilation because id is optional
      // @ts-expect-error - Testing current constraint
      const helpers = tree.entities<Form>('forms');

      expect(helpers).toBeDefined();
    });

    it('workaround: coalesce with 0 (user reported)', () => {
      interface Form {
        id?: number;
        name: string;
        data: string;
      }

      const tree = signalTree({
        forms: [] as Form[],
      }).with(withEntities());

      // User's workaround: coalesce undefined to 0
      const formsWithIds = tree.state.forms().map((f) => ({
        ...f,
        id: f.id ?? 0,
      }));

      // Now we can use entities with the coalesced type
      type FormWithId = Form & { id: number };
      const helpers = tree.entities<FormWithId>('forms');

      expect(helpers).toBeDefined();
    });
  });

  describe('Issue 2: Nested path resolution', () => {
    it('should now work with nested path like "data.forms" after fix', () => {
      interface Form {
        id: number;
        name: string;
      }

      const tree = signalTree({
        data: {
          forms: [] as Form[],
          users: [] as { id: number; name: string }[],
        },
      }).with(withEntities());

      // After fix: 'data.forms' should work
      const helpers = tree.entities<Form>('data.forms');

      // Add a form
      helpers.add({ id: 1, name: 'Test Form' });

      // Verify it's accessible
      const all = helpers.selectAll();
      expect(all().length).toBe(1);
      expect(all()[0].name).toBe('Test Form');
    });

    it('should work with deeply nested paths', () => {
      interface Form {
        id: number;
        name: string;
      }

      const tree = signalTree({
        app: {
          data: {
            forms: [] as Form[],
          },
        },
      }).with(withEntities());

      const helpers = tree.entities<Form>('app.data.forms');
      helpers.add({ id: 1, name: 'Nested Form' });

      expect(helpers.selectAll()().length).toBe(1);
    });
  });

  describe('Proposed solutions', () => {
    it('should work with explicit ID adapter pattern', () => {
      interface FormDTO {
        id?: number; // Optional for new forms
        name: string;
        data: string;
      }

      // Adapter pattern: separate entity type with required ID
      interface FormEntity {
        id: number; // Required for entities
        name: string;
        data: string;
      }

      const tree = signalTree({
        forms: [] as FormEntity[], // Store with required IDs
      }).with(withEntities());

      const helpers = tree.entities<FormEntity>('forms');

      // When adding from DTO, ensure ID
      const newFormDTO: FormDTO = { name: 'Test', data: 'content' };
      const formEntity: FormEntity = {
        ...newFormDTO,
        id: newFormDTO.id ?? 0, // Assign temp ID if needed
      };

      helpers.add(formEntity);
      expect(helpers.selectAll()().length).toBe(1);
    });
  });
});
