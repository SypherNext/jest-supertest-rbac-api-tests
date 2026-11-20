// tests/auth.test.ts
//
// Login, registration, and the JWT contract itself. Every request here is
// real HTTP to the live server -- no app import anywhere in this file.

import { api, loginAs } from '../helpers';
import type { LoginResponse } from '../types';

describe('POST /api/auth/login', () => {
  it('returns a token and user on valid credentials', async () => {
    const response = await api().post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

    expect(response.status).toBe(200);
    const body = response.body as LoginResponse;
    expect(typeof body.token).toBe('string');
    expect(body.user).toMatchObject({
      username: 'admin',
      role: 'Administrator',
      email: 'admin@hospital.com',
      full_name: 'System Administrator',
    });
  });

  it('logs in every seeded role and gets back the matching role claim', async () => {
    const admin = await loginAs('Administrator');
    const doctor = await loginAs('Doctor');
    const nurse = await loginAs('Nurse');
    const patient = await loginAs('Patient');

    expect(admin.role).toBe('Administrator');
    expect(doctor.role).toBe('Doctor');
    expect(nurse.role).toBe('Nurse');
    expect(patient.role).toBe('Patient');
  });

  it('rejects a wrong password with 401 and a generic message', async () => {
    const response = await api().post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('rejects a nonexistent username with the same generic message as a wrong password', async () => {
    const response = await api().post('/api/auth/login').send({ username: 'does-not-exist', password: 'anything' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('rejects an empty body as a credentials failure, not a validation failure', async () => {
    const response = await api().post('/api/auth/login').send({});
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });
});

describe('JWT shape', () => {
  it('is a 3-part token whose payload decodes to the logged-in user, unencrypted', async () => {
    const patient = await loginAs('Patient');
    const [, payloadSegment] = patient.token.split('.');
    const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString());

    expect(decoded.username).toBe('patient1');
    expect(decoded.role).toBe('Patient');
  });
});

describe('POST /api/auth/register', () => {
  it('reports every validation failure on a bad payload', async () => {
    const response = await api().post('/api/auth/register').send({
      username: 'ab',
      email: 'not-an-email',
      password: '123',
      role: 'SuperAdmin',
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'username', msg: 'Username must be at least 3 characters' }),
        expect.objectContaining({ path: 'email', msg: 'Invalid email address' }),
        expect.objectContaining({ path: 'password', msg: 'Password must be at least 6 characters' }),
        expect.objectContaining({ path: 'role', msg: 'Invalid role' }),
      ]),
    );
  });

  it('rejects a duplicate username with 409', async () => {
    // Targets a seeded, non-default account rather than "admin" itself --
    // the default admin account is a shared, heavily-exercised fixture
    // across this course family's test suites, so this avoids adding to
    // contention on it.
    const response = await api().post('/api/auth/register').send({
      username: 'doctor2',
      email: `duplicate-${Date.now()}@example.com`,
      password: 'password123',
      role: 'Patient',
      full_name: 'Duplicate Username Attempt',
    });

    expect(response.status).toBe(409);
  });

  it('registers a genuinely new, unique user with 201', async () => {
    const uniqueUsername = `jest_rbac_${Date.now()}`;
    const response = await api().post('/api/auth/register').send({
      username: uniqueUsername,
      email: `${uniqueUsername}@example.com`,
      password: 'password123',
      role: 'Patient',
      full_name: 'Black Box Test Patient',
    });

    expect(response.status).toBe(201);
  });
});
