/* eslint-disable @typescript-eslint/no-unused-vars */
export class RealisticBenchmarkService {
  getSessionId = () => 'test-session';
  getBatteryInfo = async () => null;
  getMachineInfo = () => ({});
  submitBenchmark = async () => ({ success: true });

  async runBenchmark(_testCase: unknown, _config: unknown): Promise<number> {
    // Mock implementation - return a realistic benchmark time in milliseconds
    return Math.random() * 100 + 50; // Random time between 50-150ms
  }

  async runMultipleBenchmarks(
    _testCases: unknown[],
    _config: unknown
  ): Promise<number[]> {
    // Mock implementation - return array of benchmark times
    return Array.from(
      { length: _testCases.length },
      () => Math.random() * 100 + 50
    );
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
