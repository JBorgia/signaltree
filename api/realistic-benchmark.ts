import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel API handler for SignalTree realistic benchmarks
// Stores benchmarks as GitHub gists and retrieves them for history
interface RealisticBenchmarkSubmission {
  id: string;
  timestamp: string;
  version: string;
  sessionId: string;
  consentGiven: boolean;
  calibration: unknown;
  machineInfo: unknown;
  config: unknown;
  results: unknown;
  weightedResults: {
    libraries: Record<
      string,
      {
        weightedScore: number;
        rank: number;
      }
    >;
    totalScenariosRun: number;
    totalTestsExecuted: number;
    totalDuration: number;
  };
  weights: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Retrieve benchmark history
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const {
        limit = '50',
        offset = '0',
        machineId,
        libraryId,
        minReliability,
        since,
      } = req.query;

      // Fetch all benchmark gists
      const response = await fetch(
        `https://api.github.com/users/JBorgia/gists`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            ...(process.env.GITHUB_TOKEN && {
              Authorization: `token ${process.env.GITHUB_TOKEN}`,
            }),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch gists');
      }

      const gists = (await response.json()) as Array<{
        id: string;
        description?: string;
        created_at: string;
        files: Record<string, { raw_url: string }>;
      }>;

      // Filter for realistic benchmark gists
      let benchmarkGists = gists.filter((gist) =>
        gist.description?.startsWith('SignalTree Realistic Benchmark:')
      );

      // Apply date filter
      if (since) {
        const sinceDate = new Date(since as string);
        benchmarkGists = benchmarkGists.filter(
          (gist) => new Date(gist.created_at) >= sinceDate
        );
      }

      // Fetch content of each benchmark gist
      const benchmarks = await Promise.all(
        benchmarkGists
          .slice(
            parseInt(offset as string),
            parseInt(offset as string) + parseInt(limit as string)
          )
          .map(async (gist) => {
            try {
              const fileKey = Object.keys(gist.files)[0];
              const fileUrl = gist.files[fileKey].raw_url;
              const contentResponse = await fetch(fileUrl);
              const content =
                (await contentResponse.json()) as RealisticBenchmarkSubmission;

              // Apply filters
              if (machineId && content.sessionId !== machineId) {
                return null;
              }

              if (
                minReliability &&
                content.calibration &&
                (content.calibration as { reliabilityScore: number })
                  .reliabilityScore < parseInt(minReliability as string)
              ) {
                return null;
              }

              if (libraryId) {
                const hasLibrary = Object.keys(
                  content.results as Record<string, unknown>
                ).some((key) => key.includes(libraryId as string));
                if (!hasLibrary) return null;
              }

              // Determine winner
              const libraries = content.weightedResults.libraries;
              const winner = Object.entries(libraries).reduce((prev, curr) =>
                curr[1].rank < prev[1].rank ? curr : prev
              );

              // Derive machine type
              const machineInfo = content.machineInfo as {
                os: string;
                cpuCores: number;
                deviceMemory?: number;
                memory: string;
              };
              const memory =
                machineInfo.deviceMemory || parseInt(machineInfo.memory) || 0;
              let machineType = 'Desktop';
              if (machineInfo.os === 'iOS' || machineInfo.os === 'Android') {
                machineType = 'Mobile';
              } else if (machineInfo.cpuCores >= 8 && memory >= 16) {
                machineType = 'High-End Desktop';
              } else if (machineInfo.cpuCores >= 4 && memory >= 8) {
                machineType = 'Mid-Range Desktop';
              } else {
                machineType = 'Budget/Laptop';
              }

              return {
                id: gist.id,
                createdAt: gist.created_at,
                timestamp: content.timestamp,
                version: content.version,
                summary: {
                  winnerLibrary: winner[0],
                  winnerScore: winner[1].weightedScore,
                  reliabilityScore: (
                    content.calibration as { reliabilityScore: number }
                  ).reliabilityScore,
                  machineType,
                  totalTests: content.weightedResults.totalTestsExecuted,
                  duration: content.weightedResults.totalDuration,
                },
              };
            } catch (error) {
              console.error('Error fetching gist content:', error);
              return null;
            }
          })
      );

      const validBenchmarks = benchmarks.filter(Boolean);

      return res.status(200).json({
        success: true,
        count: validBenchmarks.length,
        total: benchmarkGists.length,
        benchmarks: validBenchmarks,
      });
    } catch (error) {
      console.error('Error fetching benchmarks:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch benchmarks',
      });
    }
  }

  // POST: Submit new benchmark
  if (req.method === 'POST') {
    try {
      const benchmark: RealisticBenchmarkSubmission = req.body;

      // Validate required fields
      if (!benchmark.consentGiven) {
        return res.status(403).json({
          success: false,
          error: 'Consent required',
        });
      }

      if (
        !benchmark.calibration ||
        !benchmark.machineInfo ||
        !benchmark.results
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid benchmark data',
        });
      }

      // Determine winner for description
      const libraries = benchmark.weightedResults.libraries;
      const winner = Object.entries(libraries).reduce((prev, curr) =>
        curr[1].rank < prev[1].rank ? curr : prev
      );

      // Create a GitHub Gist to store the benchmark
      const gistResponse = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        },
        body: JSON.stringify({
          description: `SignalTree Realistic Benchmark: ${
            winner[0]
          } - ${winner[1].weightedScore.toFixed(1)} pts - ${new Date(
            benchmark.timestamp
          ).toISOString()}`,
          public: false,
          files: {
            [`realistic-benchmark-${benchmark.id}.json`]: {
              content: JSON.stringify(benchmark, null, 2),
            },
          },
        }),
      });

      if (!gistResponse.ok) {
        const errorData = await gistResponse.json();
        console.error('GitHub API error:', errorData);
        throw new Error('Failed to create gist');
      }

      const gistResult = (await gistResponse.json()) as { id: string };

      return res.status(200).json({
        success: true,
        id: gistResult.id,
        message: 'Benchmark submitted successfully',
      });
    } catch (error) {
      console.error('Error submitting benchmark:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit benchmark',
      });
    }
  }

  // Method not allowed
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
  });
}
