// tests/patients.test.ts
//
// GET /api/patients (list) and GET /api/patients/{patientId}/records.

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';

describe('GET /api/patients', () => {
  it.each([
    ['Administrator', 200],
    ['Doctor', 200],
    ['Nurse', 200],
    ['Patient', 403],
  ] as const)('%s gets %i', async (role, expectedStatus) => {
    const session = await loginAs(role);
    const response = await api().get('/api/patients').set(authHeader(session.token));
    expect(response.status).toBe(expectedStatus);

    if (expectedStatus === 200) {
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/patients/:patientId/records', () => {
  it('a Doctor can view a patient\'s records', async () => {
    const doctor = await loginAs('Doctor');
    const patient = await getFirstUserWithRole('Patient');

    const response = await api()
      .get(`/api/patients/${patient.id}/records`)
      .set(authHeader(doctor.token));

    expect(response.status).toBe(200);
  });

  it('returns 404 for a patient ID that does not exist', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().get('/api/patients/999999/records').set(authHeader(admin.token));
    expect(response.status).toBe(404);
  });
});
