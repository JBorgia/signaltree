
import { Component, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  entityMap,
  form,
  signalTree,
  status,
  timeTravel,
} from '@signaltree/core';

import { ExampleComponent } from '../../../../shared/components/example-shell';

import type { ISignalTree, TimeTravelMethods } from '@signaltree/core';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

interface Person {
  id: number;
  name: string;
}

type ProfileModel = {
  name: string;
  email: string;
  [k: string]: unknown;
};

interface AppState {
  counter: number;
  message: string;
  todos: Todo[];
}

interface TimeTravelEntry {
  action: string;
  timestamp: number;
  state: AppState;
  payload?: unknown;
}

interface TimeTravelInterface {
  undo(): boolean;
  redo(): boolean;
  getHistory(): TimeTravelEntry[];
  resetHistory(): void;
  jumpTo(index: number): boolean;
  getCurrentIndex(): number;
  canUndo(): boolean;
  canRedo(): boolean;
}

@Component({
  selector: 'app-time-travel-demo',
  standalone: true,
  imports: [FormsModule, ExampleComponent],
  templateUrl: './time-travel-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './time-travel-demo.component.scss',
})
export class TimeTravelDemoComponent {
  newTodoText = '';

  // ===========================================================================
  // MARKERS + UNDO — the 14.0.0 fix, demonstrated
  // ===========================================================================
  //
  // Before 14.0.0 this section could not exist. `timeTravel()` captured a
  // snapshot by walking the tree, and a marker emitted its API surface rather
  // than its state — so an undo left the marker at its POST-change value and
  // reported success, landing the user in a state that never existed.
  //
  // Measured before the fix: `n=3 rows=3` -> undo -> `n=2 rows=3`. The counter
  // rolled back, the collection did not, and nothing said so.
  //
  // The plain-leaf section below always worked, which is exactly why this one
  // is here: a demo that only exercises the passing path is how the defect
  // survived four releases.
  // Inference does the work here: `$` keeps its full marker types
  // (EntitySignal, StatusSignal, FormSignal). Only the timeTravel methods need
  // a cast, and casting the WHOLE tree — as the plain-leaf section above does —
  // would erase exactly the marker types this section exists to exercise.
  private markerTree = signalTree({
    people: entityMap<Person, number>({ selectId: (p) => p.id }),
    job: status<Error>(),
    profile: form<ProfileModel>({ initial: { name: '', email: '' } }),
  }).with(timeTravel({ maxHistorySize: 50 }));

  private get markerTT(): TimeTravelMethods<unknown> {
    return this.markerTree as unknown as TimeTravelMethods<unknown>;
  }

  private nextPersonId = 1;

  people = () => this.markerTree.$.people.all();
  peopleCount = () => this.markerTree.$.people.count();
  jobState = () => this.markerTree.$.job.state();
  profileValues = () => this.markerTree.$.profile();

  markerCanUndo = signal(false);
  markerCanRedo = signal(false);
  markerLog = signal<string[]>([]);

  // History is recorded ASYNCHRONOUSLY — a write marks the tree dirty and the
  // entry is committed on a later tick. Reading canUndo() synchronously right
  // after a write reads the PREVIOUS value, so the Undo button stayed disabled
  // until the next unrelated action. (The same detail is why undo-redo.spec.ts
  // awaits `flush()` between writes: without it, several writes collapse into
  // one history entry and an undo appears to do nothing.)
  private refreshMarkerState(action?: string) {
    setTimeout(() => this.commitMarkerState(action), 0);
  }

  private commitMarkerState(action?: string) {
    this.markerCanUndo.set(this.markerTT.canUndo());
    this.markerCanRedo.set(this.markerTT.canRedo());
    if (action) {
      this.markerLog.update((l) => [
        `${action} → ${this.peopleCount()} people, job=${this.jobState()}, name="${
          this.profileValues().name
        }"`,
        ...l,
      ].slice(0, 8));
    }
  }

  addPerson() {
    const id = this.nextPersonId++;
    this.markerTree.$.people.addOne({ id, name: `Person ${id}` });
    this.refreshMarkerState(`add person ${id}`);
  }

  removeLastPerson() {
    const all = this.people();
    if (!all.length) return;
    const last = all[all.length - 1];
    this.markerTree.$.people.removeOne(last.id);
    this.refreshMarkerState(`remove person ${last.id}`);
  }

  markJobLoaded() {
    this.markerTree.$.job.setLoaded();
    this.refreshMarkerState('job → LOADED');
  }

  markJobFailed() {
    this.markerTree.$.job.setError(new Error('Request failed'));
    this.refreshMarkerState('job → ERROR');
  }

  editProfile() {
    const n = this.people().length;
    this.markerTree.$.profile.patch({ name: `Editor ${n}`, email: `e${n}@x.io` });
    this.refreshMarkerState('edit profile');
  }

  undoMarkers() {
    this.markerTT.undo();
    this.refreshMarkerState('UNDO');
  }

  redoMarkers() {
    this.markerTT.redo();
    this.refreshMarkerState('REDO');
  }

  resetMarkers() {
    this.markerTT.resetHistory();
    this.markerLog.set([]);
    this.refreshMarkerState();
  }

  private tree = signalTree<AppState>({
    counter: 0,
    message: 'Hello SignalTree!',
    todos: [
      { id: 1, title: 'Learn SignalTree', completed: true },
      { id: 2, title: 'Try Time Travel', completed: false },
      { id: 3, title: 'Build Something Amazing', completed: false },
    ],
  }).with(
    timeTravel({ maxHistorySize: 50 })
  ) as unknown as ISignalTree<AppState> & TimeTravelMethods<AppState>;

  // Type-safe tree updater
  private updateTree = (updater: (state: AppState) => AppState) => {
    this.tree(updater);
  };

  // State signals
  counter = this.tree.$.counter;
  message = this.tree.$.message;
  todos = this.tree.$.todos;

  // Time travel signals - derive from the tree (preserves generics)
  history = signal(this.tree.getHistory());
  currentIndex = signal(this.tree.getCurrentIndex());
  canUndo = signal(this.tree.canUndo());
  canRedo = signal(this.tree.canRedo());

  // Helper to refresh time travel state
  private refreshTimeTravelState() {
    this.history.set(this.tree.getHistory());
    this.currentIndex.set(this.tree.getCurrentIndex());
    this.canUndo.set(this.tree.canUndo());
    this.canRedo.set(this.tree.canRedo());
  }

  // Computed signals
  activeTodos = computed(() => this.todos().filter((t: Todo) => !t.completed));
  completedTodos = computed(() =>
    this.todos().filter((t: Todo) => t.completed)
  );

  historyLength = computed(() => this.history().length);
  currentState = computed(() => this.history()[this.currentIndex()]);

  // Counter actions
  increment() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: state.counter + 1,
    }));
    this.refreshTimeTravelState();
  }

  decrement() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: state.counter - 1,
    }));
    this.refreshTimeTravelState();
  }

  reset() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: 0,
    }));
    this.refreshTimeTravelState();
  }

  // Message actions
  updateMessage(value: string) {
    this.updateTree((state: AppState) => ({
      ...state,
      message: value,
    }));
    this.refreshTimeTravelState();
  }

  // Todo actions
  addTodo() {
    const text = this.newTodoText.trim();
    if (!text) return;

    const newTodo: Todo = {
      id: Date.now(),
      title: text,
      completed: false,
    };

    this.updateTree((state: AppState) => ({
      ...state,
      todos: [...state.todos, newTodo],
    }));
    this.newTodoText = '';
    this.refreshTimeTravelState();
  }

  toggleTodo(id: number) {
    this.updateTree((state: AppState) => ({
      ...state,
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    }));
    this.refreshTimeTravelState();
  }

  deleteTodo(id: number) {
    this.updateTree((state: AppState) => ({
      ...state,
      todos: state.todos.filter((t) => t.id !== id),
    }));
    this.refreshTimeTravelState();
  }

  // Time travel actions
  undo() {
    this.tree.undo();
    this.refreshTimeTravelState();
  }

  redo() {
    this.tree.redo();
    this.refreshTimeTravelState();
  }

  goToState(index: number) {
    this.tree.jumpTo(index);
    this.refreshTimeTravelState();
  }

  onHistoryItemKeyup(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.goToState(index);
    }
  }

  clearHistory() {
    this.tree.resetHistory();
    this.refreshTimeTravelState();
  }

  // Generate sample actions for easy testing
  generateSampleActions() {
    // Reset history first
    this.tree.resetHistory();

    // Create a sequence of actions with delays for better history visualization
    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Starting demo...',
      }));
      this.refreshTimeTravelState();
    }, 100);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 1,
      }));
      this.refreshTimeTravelState();
    }, 200);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: [{ id: Date.now(), title: 'First task', completed: false }],
      }));
      this.refreshTimeTravelState();
    }, 300);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 5,
      }));
      this.refreshTimeTravelState();
    }, 400);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Making more changes...',
      }));
      this.refreshTimeTravelState();
    }, 500);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: [
          ...state.todos,
          { id: Date.now() + 1, title: 'Second task', completed: false },
        ],
      }));
      this.refreshTimeTravelState();
    }, 600);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 10,
      }));
      this.refreshTimeTravelState();
    }, 700);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: state.todos.map((todo, i) =>
          i === 0 ? { ...todo, completed: true } : todo
        ),
      }));
      this.refreshTimeTravelState();
    }, 800);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Demo complete! Try undo/redo now.',
      }));
      this.refreshTimeTravelState();
    }, 900);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 15,
      }));
      this.refreshTimeTravelState();
    }, 1000);
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getStatePreview(state: AppState): string {
    return `Counter: ${state.counter}, Todos: ${
      state.todos.length
    }, Message: "${state.message.substring(0, 20)}..."`;
  }
}
