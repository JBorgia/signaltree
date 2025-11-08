import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ success: false, error: 'Missing benchmark id' });
  }

  try {
    const response = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'Benchmark not found' });
    }

    const gist = (await response.json()) as {
      files: Record<string, { raw_url: string }>;
    };

    const fileKey = Object.keys(gist.files)[0];
    const fileUrl = gist.files[fileKey].raw_url;
    const contentResponse = await fetch(fileUrl);

    if (!contentResponse.ok) {
      return res.status(500).json({ success: false, error: 'Failed to load benchmark content' });
    }

    const benchmark = await contentResponse.json();

    return res.status(200).json({ success: true, benchmark });
  } catch (error) {
    console.error('Error fetching benchmark details:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch benchmark details' });
  }
}
