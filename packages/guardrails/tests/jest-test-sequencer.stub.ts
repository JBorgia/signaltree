type TestEntry = {
  path: string;
  context?: {
    config?: {
      testEnvironmentOptions?: Record<string, unknown>;
    };
  };
  result?: {
    numFailingTests?: number;
  };
};

export default class SimpleTestSequencer {
  sort(tests: TestEntry[]): TestEntry[] {
    return [...tests].sort((a, b) => (a.path > b.path ? 1 : -1));
  }

  shard(tests: TestEntry[]): TestEntry[] {
    return tests;
  }

  allFailedTests(tests: TestEntry[]): TestEntry[] {
    return tests.filter((test) => (test.result?.numFailingTests ?? 0) > 0);
  }

  cacheResults(): void {
    // Jest expects this method for caching test results between runs.
  }
}

