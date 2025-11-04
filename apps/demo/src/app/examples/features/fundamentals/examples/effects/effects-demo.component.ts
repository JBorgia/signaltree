import { CommonModule } from '@angular/common';
import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Notification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Effects & Side Effects Demo
 *
 * Demonstrates Angular effects for handling side effects like:
 * - Auto-save functionality
 * - LocalStorage sync
 * - Logging state changes
 * - Notification management
 */
@Component({
  selector: 'app-effects-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './effects-demo.component.html',
  styleUrl: './effects-demo.component.scss',
})
export class EffectsDemoComponent {
  // Auto-save example
  documentTitle = signal('');
  documentContent = signal('');
  lastSaved = signal<Date | null>(null);
  saveCount = signal(0);

  // Theme sync example
  theme = signal<'light' | 'dark'>('light');

  // Notification system
  notifications = signal<Notification[]>([]);
  nextNotificationId = 0;

  constructor() {
    // Effect 1: Auto-save when document changes
    effect(() => {
      const title = this.documentTitle();
      const content = this.documentContent();

      if (title || content) {
        // Simulate auto-save after 1 second
        setTimeout(() => {
          this.lastSaved.set(new Date());
          this.saveCount.update((count) => count + 1);
          console.log('[Auto-save] Document saved');
        }, 1000);
      }
    });

    // Effect 2: Sync theme to localStorage
    effect(() => {
      const currentTheme = this.theme();
      localStorage.setItem('demo-theme', currentTheme);
      console.log('[Theme Sync] Theme saved:', currentTheme);
    });

    // Effect 3: Log notification changes
    effect(() => {
      const notifs = this.notifications();
      console.log('[Notifications] Count:', notifs.length);
    });

    // Load theme on init
    const savedTheme = localStorage.getItem('demo-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      this.theme.set(savedTheme);
    }
  }

  resetDocument() {
    this.documentTitle.set('');
    this.documentContent.set('');
    this.lastSaved.set(null);
    this.saveCount.set(0);
  }

  toggleTheme() {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  addNotification(message: string, type: Notification['type'] = 'info') {
    const notification: Notification = {
      id: this.nextNotificationId++,
      message,
      type,
    };

    this.notifications.update((notifs) => [...notifs, notification]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, 3000);
  }

  dismissNotification(id: number) {
    this.notifications.update((notifs) => notifs.filter((n) => n.id !== id));
  }

  getLastSavedText(): string {
    const saved = this.lastSaved();
    if (!saved) return 'Never';

    const seconds = Math.floor((Date.now() - saved.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  }
}
