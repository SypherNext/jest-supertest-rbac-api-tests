// tests/smoke.test.ts
//
// A small, deliberately shallow set of checks against the most critical
// paths through the app -- "is it fundamentally broken right now?" Tagged
// with @smoke so `npm run test:smoke` can run just these in a few seconds.

import { api, loginAs, authHeader } from '../helpers';

describe('critical path @smoke', () => {
  it('login works', async () => {
    const response = await api().post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  it('login responds within a reasonable budget', async () => {
    const start = Date.now();
    const response = await api().post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    // Generous on purpose -- this is a real network round trip (black-box),
    // not the in-process call the course measures at ~150ms. The goal is
    // catching something catastrophically wrong, not a small regression.
    expect(elapsed).toBeLessThan(5000);
  });

  it('@smoke a protected endpoint responds correctly for an authenticated admin', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().get('/api/patients').set(authHeader(admin.token));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
