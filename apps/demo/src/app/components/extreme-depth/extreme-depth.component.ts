import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface ExtremeDepthStructure {
  enterprise: {
    divisions: {
      technology: {
        departments: {
          engineering: {
            teams: {
              frontend: {
                projects: {
                  signaltree: {
                    releases: {
                      v1: {
                        features: {
                          recursiveTyping: {
                            validation: {
                              tests: {
                                extreme: {
                                  status: string;
                                  depth: number;
                                  performance: string;
                                  metadata: {
                                    timestamp: Date;
                                    validator: string;
                                    confidence: number;
                                  };
                                };
                              };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}

@Component({
  selector: 'app-extreme-depth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './extreme-depth.component.html',
  styleUrls: ['./extreme-depth.component.scss'],
})
export class ExtremeDepthComponent implements OnInit {
  extremeTree = signalTree<ExtremeDepthStructure>({
    enterprise: {
      divisions: {
        technology: {
          departments: {
            engineering: {
              teams: {
                frontend: {
                  projects: {
                    signaltree: {
                      releases: {
                        v1: {
                          features: {
                            recursiveTyping: {
                              validation: {
                                tests: {
                                  extreme: {
                                    status: 'passing',
                                    depth: 15,
                                    performance: 'sub-millisecond',
                                    metadata: {
                                      timestamp: new Date(),
                                      validator: 'SignalTree Engine',
                                      confidence: 100,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  currentDepth = 15;
  currentPath =
    'enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme';
  isUpdating = false;

  performanceMetrics = {
    creation: 0.8,
    access: 0.2,
    update: 0.3,
  };

  typeInferenceExample = `// TypeScript knows this is a WritableSignal<string>
const status = extremeTree.$.enterprise.divisions.technology
  .departments.engineering.teams.frontend.projects.signaltree
  .releases.v1.features.recursiveTyping.validation.tests
  .extreme.status(); // Perfect type inference at 15+ levels!`;

  updateExample = `// Update with full type safety - no 'any' types!
extremeTree.$.enterprise.divisions.technology.departments
  .engineering.teams.frontend.projects.signaltree.releases.v1
  .features.recursiveTyping.validation.tests.extreme.depth.set(20);

// TypeScript validates the type at every level`;

  ngOnInit() {
    this.measurePerformance();
  }

  updateStatus() {
    this.isUpdating = true;

    const start = performance.now();

    // Update at extreme depth
    this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.status.set(
      'updated'
    );

    const updateTime = performance.now() - start;
    this.performanceMetrics.update = Math.round(updateTime * 1000) / 1000;

    setTimeout(() => {
      this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.status.set(
        'passing'
      );
      this.isUpdating = false;
    }, 500);
  }

  incrementDepth() {
    const currentDepth =
      this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.depth();

    this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.depth.set(
      currentDepth + 1
    );

    this.currentDepth = currentDepth + 1;
  }

  updatePerformance() {
    const performances = [
      'sub-millisecond',
      'lightning-fast',
      'optimal',
      'blazing',
    ];
    const current =
      this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.performance();

    const currentIndex = performances.indexOf(current);
    const nextIndex = (currentIndex + 1) % performances.length;

    this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.performance.set(
      performances[nextIndex]
    );
  }

  private measurePerformance() {
    // Measure creation time
    const creationStart = performance.now();
    signalTree({
      test: { deep: { structure: { at: { fifteen: { levels: 'test' } } } } },
    });
    this.performanceMetrics.creation =
      Math.round((performance.now() - creationStart) * 1000) / 1000;

    // Measure access time
    const accessStart = performance.now();
    this.extremeTree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.status();
    this.performanceMetrics.access =
      Math.round((performance.now() - accessStart) * 1000) / 1000;
  }
}
