import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { signalTree, timeTravel } from '@signaltree/core';

@Component({
  selector: 'app-undo-redo-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './undo-redo-demo.component.html',
})
export class UndoRedoDemoComponent {
  private tree = signalTree<{ items: string[] }>({ items: [] }).with(timeTravel());
  items = this.tree.$.items;

  add() {
    this.tree.$.items.update((items: string[]) => [
      ...items,
      `item_${Date.now()}`,
    ]);
  }

  undo() {
    this.tree.undo();
  }

  redo() {
    this.tree.redo();
  }

  canUndo() {
    return (this.tree as any).timeTravel?.canUndo?.() ?? false;
  }

  canRedo() {
    return (this.tree as any).timeTravel?.canRedo?.() ?? false;
  }
}
