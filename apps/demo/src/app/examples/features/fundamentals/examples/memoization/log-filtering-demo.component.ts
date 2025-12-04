import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withEntities, withMemoization } from '@signaltree/core';

interface Log {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  userId?: string;
}

@Component({
  selector: 'app-log-filtering-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="log-filtering-demo">
      <h2>Memoization: Log Filtering Performance</h2>

      <div class="demo-description">
        <p>
          Demonstrates memoization with entity filtering. With
          {{ totalLogs() }} logs, filtering is cached and only recalculates when
          filters or logs change.
        </p>
      </div>

      <div class="controls">
        <div class="control-group">
          <label for="level">Level:</label>
          <select
            id="level"
            [(ngModel)]="selectedLevel"
            (ngModelChange)="updateLevelFilter($event)"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div class="control-group">
          <label for="search">Search:</label>
          <input
            id="search"
            type="text"
            [(ngModel)]="searchText"
            (ngModelChange)="updateSearchFilter($event)"
            placeholder="Search messages..."
          />
        </div>

        <div class="control-group">
          <label for="userId">User ID:</label>
          <input
            id="userId"
            type="text"
            [(ngModel)]="userIdFilter"
            (ngModelChange)="updateUserFilter($event)"
            placeholder="Filter by user..."
          />
        </div>

        <div class="button-group">
          <button (click)="addRandomLog()" class="btn btn-primary">
            Add Random Log
          </button>
          <button (click)="addBulkLogs()" class="btn btn-secondary">
            Add 1000 Logs
          </button>
          <button (click)="clearLogs()" class="btn btn-danger">
            Clear All
          </button>
        </div>
      </div>

      <div class="code-section">
        <h3>💻 Code Example</h3>
        <pre><code>{{ codeExample }}</code></pre>
      </div>

      <div class="stats">
        <div class="stat-card">
          <span class="stat-label">Total Logs:</span>
          <span class="stat-value">{{ totalLogs() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Filtered Logs:</span>
          <span class="stat-value">{{ filteredCount() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Cache Hits:</span>
          <span class="stat-value">{{ cacheHits() }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Filter Time:</span>
          <span class="stat-value">{{ filterTime() }}ms</span>
        </div>
      </div>

      <div class="performance-info">
        <p><strong>Performance Impact:</strong></p>
        <ul>
          <li>✅ Memoized: Filters cached until logs or filters change</li>
          <li>
            ❌ Without: Would re-filter all {{ totalLogs() }} logs on every
            render
          </li>
          <li>🚀 Benefit: {{ performanceBenefit() }}</li>
        </ul>
      </div>

      <div class="log-viewer">
        <h3>Filtered Logs ({{ filteredCount() }})</h3>
        <div class="log-list">
          @for (log of displayedLogs(); track log.id) {
          <div class="log-entry" [class]="'log-' + log.level">
            <span class="log-timestamp">{{
              log.timestamp | date : 'short'
            }}</span>
            <span class="log-level">{{ log.level.toUpperCase() }}</span>
            <span class="log-message">{{ log.message }}</span>
            @if (log.userId) {
            <span class="log-user">User: {{ log.userId }}</span>
            }
          </div>
          } @empty {
          <div class="empty-state">No logs match the current filters</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .log-filtering-demo {
        padding: 20px;
      }

      .demo-description {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 20px;
        padding: 15px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .control-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .button-group {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-left: auto;
      }

      .control-group label {
        font-weight: 600;
        font-size: 14px;
      }

      .control-group select,
      .control-group input {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #007bff;
        color: white;
      }

      .btn-secondary {
        background: #6c757d;
        color: white;
      }

      .btn-danger {
        background: #dc3545;
        color: white;
      }

      .btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .stat-label {
        font-size: 14px;
        color: #666;
      }

      .stat-value {
        font-size: 24px;
        font-weight: bold;
        color: #007bff;
      }

      .performance-info {
        background: #e7f3ff;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
        border-left: 4px solid #007bff;
      }

      .performance-info ul {
        margin: 10px 0 0 0;
        padding-left: 20px;
      }

      .performance-info li {
        margin: 5px 0;
      }

      .log-viewer {
        background: white;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .log-viewer h3 {
        margin: 0 0 15px 0;
        color: #333;
      }

      .log-list {
        max-height: 500px;
        overflow-y: auto;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      .log-entry {
        display: flex;
        gap: 10px;
        padding: 10px;
        border-bottom: 1px solid #eee;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        align-items: center;
      }

      .log-entry:last-child {
        border-bottom: none;
      }

      .log-info {
        background: #e3f2fd;
      }

      .log-warn {
        background: #fff3e0;
      }

      .log-error {
        background: #ffebee;
      }

      .log-timestamp {
        color: #666;
        white-space: nowrap;
      }

      .log-level {
        font-weight: bold;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }

      .log-info .log-level {
        background: #2196f3;
        color: white;
      }

      .log-warn .log-level {
        background: #ff9800;
        color: white;
      }

      .log-error .log-level {
        background: #f44336;
        color: white;
      }

      .log-message {
        flex: 1;
      }

      .log-user {
        color: #666;
        font-size: 12px;
        white-space: nowrap;
      }

      .empty-state {
        padding: 40px;
        text-align: center;
        color: #999;
        font-style: italic;
      }

      .code-section {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .code-section h3 {
        margin: 0 0 15px 0;
        color: #333;
      }

      .code-section pre {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 4px;
        overflow-x: auto;
        margin: 0;
      }

      .code-section code {
        font-family: 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.6;
        color: #333;
      }
    `,
  ],
})
export class LogFilteringDemoComponent {
  codeExample = `// Create tree with memoization
const tree = signalTree({
  logs: [] as Log[],
  filters: {
    level: 'all',
    search: '',
    userId: null
  }
}).with(withMemoization(), withEntities());

// Memoized filtered logs - cached automatically!
const filteredLogs = tree.memoize(state => {
  let logs = state.logs;

  if (state.filters.level !== 'all') {
    logs = logs.filter(log => log.level === state.filters.level);
  }

  if (state.filters.search) {
    logs = logs.filter(log =>
      log.message.toLowerCase().includes(
        state.filters.search.toLowerCase()
      )
    );
  }

  if (state.filters.userId) {
    logs = logs.filter(log => log.userId === state.filters.userId);
  }

  return logs;
}, 'filtered-logs');

// Use in component - auto-updates when filters change!
filteredLogs(); // Returns cached result`;
  selectedLevel = 'all';
  searchText = '';
  userIdFilter = '';

  private cacheHitCount = 0;
  private lastFilterTime = 0;

  // Create the tree with memoization and entities
  private tree = signalTree({
    logs: [] as Log[],
    filters: {
      level: 'all' as 'all' | 'info' | 'warn' | 'error',
      search: '',
      userId: null as string | null,
    },
  }).with(withMemoization(), withEntities());

  // Get entity manager
  private logsEntity = this.tree.entities<Log>('logs');

  // Memoized filtered logs - this is the key performance optimization
  private filteredLogs = this.tree.memoize((state) => {
    const startTime = performance.now();
    let logs = state.logs;

    if (state.filters.level !== 'all') {
      logs = logs.filter((log) => log.level === state.filters.level);
    }

    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      logs = logs.filter((log) =>
        log.message.toLowerCase().includes(searchLower)
      );
    }

    if (state.filters.userId) {
      logs = logs.filter((log) => log.userId === state.filters.userId);
    }

    this.lastFilterTime = performance.now() - startTime;
    this.cacheHitCount++;

    return logs;
  }, 'filtered-logs');

  // Computed signals for UI
  totalLogs = computed(() => this.tree.$.logs().length);
  filteredCount = computed(() => this.filteredLogs().length);
  displayedLogs = computed(() => this.filteredLogs().slice(0, 100)); // Limit display for performance
  cacheHits = computed(() => this.cacheHitCount);
  filterTime = computed(() => this.lastFilterTime.toFixed(3));
  performanceBenefit = computed(() => {
    const total = this.totalLogs();
    if (total < 100) return 'Add more logs to see performance benefits';
    if (total < 1000) return 'Moderate benefit with ' + total + ' logs';
    return (
      'Significant benefit! Without memoization would re-filter ' +
      total +
      ' logs on every render'
    );
  });

  constructor() {
    // Add initial sample logs
    this.addInitialLogs();
  }

  updateLevelFilter(level: string) {
    this.tree.$.filters.level.set(level as 'all' | 'info' | 'warn' | 'error');
  }

  updateSearchFilter(search: string) {
    this.tree.$.filters.search.set(search);
  }

  updateUserFilter(userId: string) {
    this.tree.$.filters.userId.set(userId || null);
  }

  addRandomLog() {
    const levels: Log['level'][] = ['info', 'warn', 'error'];
    const messages = [
      'User logged in successfully',
      'Database connection established',
      'API request completed',
      'Cache miss, fetching from database',
      'Warning: High memory usage detected',
      'Error: Failed to connect to external service',
      'Payment processed successfully',
      'Email sent to user',
      'Session expired',
      'File uploaded successfully',
    ];
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', null];

    const log: Log = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      level: levels[Math.floor(Math.random() * levels.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
      userId: userIds[Math.floor(Math.random() * userIds.length)] || undefined,
    };

    this.logsEntity.add(log);
  }

  addBulkLogs() {
    const logs: Log[] = [];
    for (let i = 0; i < 1000; i++) {
      const levels: Log['level'][] = ['info', 'warn', 'error'];
      const messages = [
        'User logged in successfully',
        'Database query executed',
        'API endpoint called',
        'Cache updated',
        'Warning: Slow query detected',
        'Error: Network timeout',
        'Transaction completed',
        'Email queued',
        'Session refreshed',
        'Data synchronized',
      ];
      const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', null];

      logs.push({
        id: `log-${Date.now()}-${i}-${Math.random()}`,
        timestamp: new Date(Date.now() - Math.random() * 86400000), // Random time in last 24h
        level: levels[Math.floor(Math.random() * levels.length)],
        message: messages[Math.floor(Math.random() * messages.length)],
        userId:
          userIds[Math.floor(Math.random() * userIds.length)] || undefined,
      });
    }

    // Add all logs at once
    logs.forEach((log) => this.logsEntity.add(log));
  }

  clearLogs() {
    // Get all current logs and remove them via entity manager
    const allLogs = this.tree.$.logs();
    allLogs.forEach((log) => this.logsEntity.remove(log.id));
    this.cacheHitCount = 0;
  }

  private addInitialLogs() {
    const sampleLogs: Log[] = [
      {
        id: '1',
        timestamp: new Date(),
        level: 'info',
        message: 'Application started successfully',
        userId: 'user-1',
      },
      {
        id: '2',
        timestamp: new Date(),
        level: 'info',
        message: 'Database connection established',
      },
      {
        id: '3',
        timestamp: new Date(),
        level: 'warn',
        message: 'High memory usage detected: 85%',
      },
      {
        id: '4',
        timestamp: new Date(),
        level: 'error',
        message: 'Failed to fetch user profile',
        userId: 'user-2',
      },
      {
        id: '5',
        timestamp: new Date(),
        level: 'info',
        message: 'Cache cleared successfully',
      },
    ];

    sampleLogs.forEach((log) => this.logsEntity.add(log));
  }
}
