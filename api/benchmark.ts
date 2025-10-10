import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * @deprecated This API endpoint is no longer actively used.
 *
 * It was originally created for the "Extreme Depth" typing demo benchmark,
 * but that demo is not a competitive comparison and doesn't need historical tracking.
 *
 * This endpoint is kept for backward compatibility to access any existing historical data.
 *
 * For NEW benchmark data, see /api/realistic-benchmark.ts which handles the
 * "Realistic Comparison" benchmarks (SignalTree vs NgRx vs Akita vs Elf vs NgXs).
 */

interface BenchmarkSubmission {
  timestamp: string;
  depth: number;
  sessionId: string;
  consentGiven: boolean;

  machineInfo: {
    browser: string;
    os: string;
    cpuCores: number;
    memory: string;
    screenResolution: string;
    devicePixelRatio: number;
    userAgent: string;
  };

  results: {
    creationTime: number;
    accessTime: number;
    updateTime: number;
    totalTests: number;
  };

  version: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Retrieve all benchmarks
  if (req.method === 'GET') {
    try {
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

      // Filter for benchmark gists
      const benchmarkGists = gists.filter((gist) =>
        gist.description?.startsWith('SignalTree Benchmark:')
      );

      // Fetch content of each benchmark gist
      const benchmarks = await Promise.all(
        benchmarkGists.slice(0, 100).map(async (gist) => {
          try {
            const fileKey = Object.keys(gist.files)[0];
            const fileUrl = gist.files[fileKey].raw_url;
            const contentResponse = await fetch(fileUrl);
            const content = await contentResponse.json();
            return {
              id: gist.id,
              createdAt: gist.created_at,
              ...content,
            };
          } catch (error) {
            console.error('Error fetching gist content:', error);
            return null;
          }
        })
      );

      return res.status(200).json({
        success: true,
        count: benchmarks.filter(Boolean).length,
        benchmarks: benchmarks.filter(Boolean),
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
      const benchmark: BenchmarkSubmission = req.body;

      // Validate required fields
      if (!benchmark.consentGiven) {
        return res.status(403).json({
          success: false,
          error: 'Consent required',
        });
      }

      if (!benchmark.machineInfo || !benchmark.results) {
        return res.status(400).json({
          success: false,
          error: 'Invalid benchmark data',
        });
      }

      // Create a GitHub Gist to store the benchmark
      const gistResponse = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        },
        body: JSON.stringify({
          description: `SignalTree Benchmark: ${
            benchmark.depth
          } levels - ${benchmark.results.creationTime.toFixed(3)}ms`,
          public: false,
          files: {
            'benchmark.json': {
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

      const gistData = await gistResponse.json();

      return res.status(201).json({
        success: true,
        id: gistData.id,
        url: gistData.html_url,
      });
    } catch (error) {
      console.error('Error storing benchmark:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to store benchmark',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
