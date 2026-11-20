// tests/medical-records.test.ts
//
// CRUD + role gates for /api/medical-records, including the real,
// verified divergence: GET /api/medical-records does not filter results
// for a Nurse the way a stricter reading of the permission docs might
// imply -- a Nurse sees every record, the same as an Administrator.

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';
import type { MedicalRecord } from '../types';

describe('medical record CRUD lifecycle (Doctor-only writes)', () => {
  it('a Doctor can create, read, update, and delete a medical record', async () => {
    const doctor = await loginAs('Doctor');
    const patient = await getFirstUserWithRole('Patient');

    const created = await api()
      .post('/api/medical-records')
      .set(authHeader(doctor.token))
      .send({ patient_id: patient.id, diagnosis: 'jest-supertest-rbac-api-tests probe', prescription: 'rest' });
    expect(created.status).toBe(201);

    expect(created.body.message).toBe('Medical record created successfully');
    const recordId = created.body.recordId;
    expect(recordId).toBeDefined();

    const fetched = await api().get(`/api/medical-records/${recordId}`).set(authHeader(doctor.token));
    expect(fetched.status).toBe(200);
    const record = fetched.body as MedicalRecord;
    expect(record.patient_id).toBe(patient.id);
    expect(record.diagnosis).toBe('jest-supertest-rbac-api-tests probe');

    const updated = await api()
      .put(`/api/medical-records/${recordId}`)
      .set(authHeader(doctor.token))
      .send({ diagnosis: 'updated diagnosis' });
    expect(updated.status).toBe(200);

    const afterUpdate = await api().get(`/api/medical-records/${recordId}`).set(authHeader(doctor.token));
    expect(afterUpdate.body.diagnosis).toBe('updated diagnosis');

    const deleted = await api().delete(`/api/medical-records/${recordId}`).set(authHeader(doctor.token));
    expect(deleted.status).toBe(200);
  });

  it.each([
    ['Administrator', 403],
    ['Nurse', 403],
    ['Patient', 403],
  ] as const)('%s cannot create a medical record (%i)', async (role, expectedStatus) => {
    const session = await loginAs(role);
    const patient = await getFirstUserWithRole('Patient');

    const response = await api()
      .post('/api/medical-records')
      .set(authHeader(session.token))
      .send({ patient_id: patient.id, diagnosis: 'should be rejected' });

    expect(response.status).toBe(expectedStatus);
  });

  it('a Doctor or Administrator can delete; a Nurse or Patient cannot', async () => {
    const doctorDelete = await api()
      .delete('/api/medical-records/999999')
      .set(authHeader((await loginAs('Doctor')).token));
    expect(doctorDelete.status).toBe(404); // role check passes, record doesn't exist

    const adminDelete = await api()
      .delete('/api/medical-records/999999')
      .set(authHeader((await loginAs('Administrator')).token));
    expect(adminDelete.status).toBe(404);

    const nurseDelete = await api()
      .delete('/api/medical-records/999999')
      .set(authHeader((await loginAs('Nurse')).token));
    expect(nurseDelete.status).toBe(403);

    const patientDelete = await api()
      .delete('/api/medical-records/999999')
      .set(authHeader((await loginAs('Patient')).token));
    expect(patientDelete.status).toBe(403);
  });

  it('documents the real divergence: a Nurse CAN list every medical record, unfiltered', async () => {
    const nurse = await loginAs('Nurse');
    const admin = await loginAs('Administrator');

    const nurseView = await api().get('/api/medical-records').set(authHeader(nurse.token));
    const adminView = await api().get('/api/medical-records').set(authHeader(admin.token));

    expect(nurseView.status).toBe(200);
    // Not scoped at all for a Nurse -- same total visibility as an Admin.
    // A stricter reading of the RBAC docs might expect this to be filtered
    // or denied; it's neither, and that's the real, current behavior.
    expect(nurseView.body.length).toBe(adminView.body.length);
  });
});
