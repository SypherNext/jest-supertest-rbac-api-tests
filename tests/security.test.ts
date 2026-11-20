// tests/security.test.ts
//
// Two defenses confirmed working, and one real, unfixed gap documented as
// it actually behaves today.

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';

describe('JWT tampering', () => {
  it('rejects a token with a tampered payload, even if the shape looks valid', async () => {
    const patient = await loginAs('Patient');
    const [header, payload, signature] = patient.token.split('.');

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const tamperedPayload = Buffer.from(JSON.stringify({ ...decoded, role: 'Administrator' })).toString(
      'base64url',
    );
    const forgedToken = `${header}.${tamperedPayload}.${signature}`; // old signature, new claims

    const response = await api().get('/api/users').set('Authorization', `Bearer ${forgedToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Invalid or expired token');
  });
});

describe('SQL injection resistance', () => {
  it('does not let a SQL injection payload bypass login', async () => {
    const response = await api().post('/api/auth/login').send({ username: "admin' OR '1'='1", password: 'anything' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });
});

describe('a real, verified gap: appointment parameter tampering', () => {
  it('lets a patient create an appointment under a different patient_id', async () => {
    const patient1 = await loginAs('Patient'); // patient1
    const admin = await loginAs('Administrator');
    const doctor = await getFirstUserWithRole('Doctor');

    // A real, different Patient -- patient_id must now reference an
    // existing Patient user (the app validates existence, not identity),
    // so a hardcoded id offset would be fragile against reseeded data.
    const patientsResponse = await api().get('/api/users/role/Patient').set(authHeader(admin.token));
    const otherPatient = (patientsResponse.body as Array<{ id: number }>).find(
      (p) => p.id !== patient1.userId,
    );
    if (!otherPatient) {
      throw new Error('Need at least two seeded Patient users for this test');
    }

    const response = await api()
      .post('/api/appointments')
      .set(authHeader(patient1.token))
      .send({
        patient_id: otherPatient.id, // a different patient entirely -- never checked against the caller's own identity
        doctor_id: doctor.id,
        appointment_date: '2026-09-05T10:00:00',
        reason: 'jest-supertest-rbac-api-tests: parameter tampering probe',
      });

    // Documenting the app's real, current behavior: this succeeds, because
    // POST /api/appointments never checks patient_id against the
    // authenticated caller's own identity -- it only checks (since the
    // validation fix) that patient_id refers to *some* real Patient user.
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('appointmentId');
  });
});
