// tests/negative-and-edge-cases.test.ts
//
// Confirming real failure behavior instead of assuming it -- several of
// these don't match the "obvious" guess.

import { api, loginAs, authHeader } from '../helpers';

describe('token failure modes', () => {
  it('missing token gets 401, invalid token gets 403 -- two different failure states', async () => {
    const noToken = await api().get('/api/appointments');
    expect(noToken.status).toBe(401);
    expect(noToken.body.error).toBe('Access token required');

    const badToken = await api().get('/api/appointments').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(403);
    expect(badToken.body.error).toBe('Invalid or expired token');
  });
});

describe('previously-unvalidated routes now validate required fields', () => {
  it('a missing required field on POST /api/appointments now returns a clean 400', async () => {
    const admin = await loginAs('Administrator');
    const response = await api()
      .post('/api/appointments')
      .set(authHeader(admin.token))
      .send({ doctor_id: 5, appointment_date: '2026-09-01T10:00:00', reason: 'missing patient_id' });

    expect(response.status).toBe(400);
  });

  it('a non-numeric ID in the URL is treated as not found, not a bad request', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().get('/api/appointments/not-a-number').set(authHeader(admin.token));
    expect(response.status).toBe(404);
  });

  it('PUT and DELETE on a nonexistent appointment ID agree: both a clean 404', async () => {
    const admin = await loginAs('Administrator');

    const putResponse = await api()
      .put('/api/appointments/999999')
      .set(authHeader(admin.token))
      .send({ status: 'completed' });
    expect(putResponse.status).toBe(404);
    expect(putResponse.body.error).toBe('Appointment not found');

    const deleteResponse = await api().delete('/api/appointments/999999').set(authHeader(admin.token));
    expect(deleteResponse.status).toBe(404);
    expect(deleteResponse.body.error).toBe('Appointment not found');
  });
});

describe('registration edge cases', () => {
  it('reports every validation failure on a bad registration payload', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'not-an-email', password: '123', role: 'SuperAdmin' });

    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThanOrEqual(4);
  });
});
