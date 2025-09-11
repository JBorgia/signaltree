#!/bin/bash
# Deploy SignalTree Performance Comparison Site
# This script sets up a production-ready hosted benchmark site

set -e

echo "🚀 Setting up SignalTree Performance Comparison Site"

# 1. Build production version
echo "📦 Building production bundle..."
pnpm nx build demo --configuration=production

# 2. Add necessary files for hosting
echo "📄 Adding hosting configuration..."

# Create netlify.toml for Netlify deployment
cat > dist/apps/demo/netlify.toml << EOF
[build]
  publish = "."
  command = "echo 'Build complete'"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
EOF

# Create vercel.json for Vercel deployment
cat > dist/apps/demo/vercel.json << EOF
{
  "version": 2,
  "builds": [
    {
      "src": "**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
EOF

# 3. Add manifest for PWA capabilities
cat > dist/apps/demo/manifest.json << EOF
{
  "name": "SignalTree Performance Benchmarks",
  "short_name": "SignalTree Bench",
  "description": "Real-time performance comparisons for SignalTree vs other state libraries",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f5f5",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "assets/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "assets/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
EOF

# 4. Add robots.txt
cat > dist/apps/demo/robots.txt << EOF
User-agent: *
Allow: /
Sitemap: https://benchmarks.signaltree.dev/sitemap.xml
EOF

# 5. Add basic analytics and monitoring
cat > dist/apps/demo/analytics.html << EOF
<!-- Plausible Analytics -->
<script defer data-domain="benchmarks.signaltree.dev" src="https://plausible.io/js/script.js"></script>

<!-- Web Vitals reporting -->
<script type="module">
  import {getCLS, getFID, getFCP, getLCP, getTTFB} from 'https://unpkg.com/web-vitals@3/dist/web-vitals.js';

  function sendToAnalytics(metric) {
    // Send to your analytics service
    console.log('Web Vital:', metric);
  }

  getCLS(sendToAnalytics);
  getFID(sendToAnalytics);
  getFCP(sendToAnalytics);
  getLCP(sendToAnalytics);
  getTTFB(sendToAnalytics);
</script>
EOF

echo "✅ Production build ready for deployment!"
echo ""
echo "🌐 Deployment options:"
echo "1. Netlify: drag-and-drop dist/apps/demo folder to netlify.com/drop"
echo "2. Vercel: vercel --prod dist/apps/demo"
echo "3. GitHub Pages: push dist/apps/demo to gh-pages branch"
echo ""
echo "🎯 Recommended custom domain: benchmarks.signaltree.dev"
echo "📊 Analytics: Configure Plausible at plausible.io"
echo "🔧 CI/CD: Add .github/workflows/deploy.yml for automated deployments"
