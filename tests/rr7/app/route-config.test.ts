import { describe, it, expect } from 'vitest';
import routes from '~/routes';

describe('route config', () => {
  it('exports a non-empty array of route definitions', () => {
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('contains the app layout route with child page routes', () => {
    // The first entry should be the layout wrapping child page routes
    const layoutRoute = routes[0];
    expect(layoutRoute).toBeDefined();
    expect(layoutRoute.file).toContain('_app.tsx');
    expect(Array.isArray(layoutRoute.children)).toBe(true);

    const childFiles = layoutRoute.children!.map((c: any) => c.file);
    expect(childFiles).toContain('routes/_app._index.tsx');
    expect(childFiles).toContain('routes/_app.settings.tsx');
  });

  it('contains API routes under api/ prefix', () => {
    // API routes are spread into the top-level array after the layout
    const apiPaths = routes
      .filter((r: any) => r.path?.startsWith('api/'))
      .map((r: any) => r.path);

    expect(apiPaths).toContain('api/health');
    expect(apiPaths).toContain('api/projects');
    expect(apiPaths).toContain('api/config');
    expect(apiPaths).toContain('api/credentials');
    expect(apiPaths).toContain('api/chat');
  });

  it('contains a top-level catch-all route for unmatched requests', () => {
    const catchAllRoute = routes.find((r: any) => r.path === '*');
    expect(catchAllRoute).toBeDefined();
    expect(catchAllRoute.file).toContain('routes/_catchall.tsx');
  });
});
