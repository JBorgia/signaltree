# Production Deployment

Guidance for building and deploying the SignalTree demo and apps using SignalTree.

## Build

```bash
npx nx build demo --configuration=production
```

## Preview

```bash
npx http-server dist/apps/demo -p 8080 -c-1
```

## Performance checks

- Lighthouse against local preview
- Bundle analysis: npm run size:report

## Optimization features

- Code splitting and lazy loading
- Tree shaking and minification
- Gzip/Brotli compression

## CDN hints (Nginx)

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
location / {
  try_files $uri $uri/ /index.html;
  add_header Cache-Control "no-cache";
}
```

---

Consolidated from `PRODUCTION-DEPLOYMENT.md`.
