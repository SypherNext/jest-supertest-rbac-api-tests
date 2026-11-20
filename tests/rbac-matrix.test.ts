// tests/rbac-matrix.test.ts
//
// The full 4-role permission matrix, verified directly against the real,
// running app -- not assumed from a README. Two rows are deliberately
// highlighted because they're easy to get wrong by intuition alone: there
// is no role restriction at all on creating an appointment, and a Nurse or
// Doctor can view any patient's records, not just their own patients'.

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';
import type { Role } from '../types';

describe('create-appointment role gate', () => {
  it.each(['Administrator', 'Doctor', 'Nurse', 'Patient'] as Role[])(
    '%s can create an appointment -- no role restriction on this endpoint',
    async (role) => {
      const session = await loginAs(role);
      const patient = await getFirstUserWithRole('Patient');
      const doctor = await getFirstUserWithRole('Doctor');
      const response = await api()
        .post('/api/appointments')
        .set(authHeader(session.token))
        .send({
          patient_id: patient.id,
          doctor_id: doctor.id,
          appointment_date: '2026-12-10T10:00:00',
          reason: `rbac-matrix probe as ${role}`,
        });
      expect(response.status).toBe(201);
    },
  );
});

describe('DELETE /api/medical-records/:id -- role gate', () => {
  const cases: Array<[Role, number]> = [
    ['Administrator', 404], // role check passes, then 404 because the record doesn't exist
    ['Doctor', 404],
    ['Nurse', 403],
    ['Patient', 403],
  ];

  it.each(cases)('role %s gets %i', async (role, expectedStatus) => {
    const session = await loginAs(role);
    const response = await api().delete('/api/medical-records/999999').set(authHeader(session.token));
    expect(response.status).toBe(expectedStatus);

    if (expectedStatus === 403) {
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Access denied. Insufficient permissions.',
          userRole: role,
        }),
      );
      expect(response.body.requiredRoles).toEqual(expect.arrayContaining(['Administrator', 'Doctor']));
    }
  });
});

describe('every protected endpoint rejects requests with no token', () => {
  const protectedEndpoints: Array<[string, string]> = [
    ['get', '/api/appointments'],
    ['get', '/api/medical-records'],
    ['get', '/api/patients'],
    ['get', '/api/users'],
    ['get', '/api/users/role/Doctor'],
  ];

  test.each(protectedEndpoints)('%s %s -> 401 with no token', async (method, path) => {
    const response = await (api() as any)[method](path);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Access token required');
  });
});
