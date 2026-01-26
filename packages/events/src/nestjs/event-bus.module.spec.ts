import { describe, expect, it } from 'vitest';

import { QUEUE_PRESETS, QueuePreset } from './event-bus.module';

describe('EventBusModule', () => {
  describe('Queue Presets', () => {
    describe('QUEUE_PRESETS', () => {
      it('should define priority-based preset with 5 queues', () => {
        const preset = QUEUE_PRESETS['priority-based'];

        expect(preset).toHaveLength(5);
        expect(preset.map(q => q.name)).toEqual([
          'events-critical',
          'events-high',
          'events-normal',
          'events-low',
          'events-bulk',
        ]);
      });

      it('should map each priority to exactly one queue in priority-based', () => {
        const preset = QUEUE_PRESETS['priority-based'];
        const allPriorities = preset.flatMap(q => q.priorities);

        expect(allPriorities).toContain('critical');
        expect(allPriorities).toContain('high');
        expect(allPriorities).toContain('normal');
        expect(allPriorities).toContain('low');
        expect(allPriorities).toContain('bulk');
        expect(allPriorities).toHaveLength(5); // No duplicates
      });

      it('should have higher concurrency for critical queue', () => {
        const preset = QUEUE_PRESETS['priority-based'];
        const critical = preset.find(q => q.name === 'events-critical');
        const bulk = preset.find(q => q.name === 'events-bulk');

        expect(critical?.concurrency).toBeGreaterThan(bulk?.concurrency ?? 0);
      });

      it('should have rate limit on bulk queue', () => {
        const preset = QUEUE_PRESETS['priority-based'];
        const bulk = preset.find(q => q.name === 'events-bulk');

        expect(bulk?.rateLimit).toBeDefined();
        expect(bulk?.rateLimit?.max).toBe(100);
        expect(bulk?.rateLimit?.duration).toBe(1000);
      });

      it('should define single-queue preset with 1 queue', () => {
        const preset = QUEUE_PRESETS['single-queue'];

        expect(preset).toHaveLength(1);
        expect(preset[0].name).toBe('events');
        expect(preset[0].priorities).toContain('critical');
        expect(preset[0].priorities).toContain('bulk');
      });

      it('should define minimal preset for development', () => {
        const preset = QUEUE_PRESETS['minimal'];

        expect(preset).toHaveLength(1);
        expect(preset[0].name).toBe('events');
        expect(preset[0].concurrency).toBe(3);
      });

      it('should have all preset keys typed correctly', () => {
        const presetKeys: QueuePreset[] = ['priority-based', 'single-queue', 'minimal'];

        presetKeys.forEach(key => {
          expect(QUEUE_PRESETS[key]).toBeDefined();
          expect(Array.isArray(QUEUE_PRESETS[key])).toBe(true);
        });
      });
    });

    describe('Queue Config Shape', () => {
      it('should have required fields in each queue config', () => {
        Object.values(QUEUE_PRESETS).forEach(preset => {
          preset.forEach(queue => {
            expect(queue.name).toBeDefined();
            expect(typeof queue.name).toBe('string');
            expect(queue.priorities).toBeDefined();
            expect(Array.isArray(queue.priorities)).toBe(true);
            expect(queue.priorities.length).toBeGreaterThan(0);
          });
        });
      });

      it('should have concurrency as positive number when defined', () => {
        Object.values(QUEUE_PRESETS).forEach(preset => {
          preset.forEach(queue => {
            if (queue.concurrency !== undefined) {
              expect(queue.concurrency).toBeGreaterThan(0);
            }
          });
        });
      });
    });
  });
});
