// tests/database.test.ts
//
// Verifying writes directly against the real SQLite file, not just by
// reading them back through the API -- the same discipline the course's
// own database-testing module teaches, adapted to black-box: this helper
// opens its own connection to the on-disk database from a separate
// process, rather than sharing the app's process the way an in-process
// suite can.

import { api, loginAs, authHeader, getFirstUserWithRole, queryOne } from '../helpers';

describe('direct SQLite verification', () => {
  it('creates an appointment via the API and confirms the row directly in SQLite', async () => {
    const patient = await getFirstUserWithRole('Patient');
    const doctor = await getFirstUserWithRole('Doctor');
    const admin = await loginAs('Administrator');

    const created = await api()
      .post('/api/appointments')
      .set(authHeader(admin.token))
      .send({
        patient_id: patient.id,
        doctor_id: doctor.id,
        appointment_date: '2026-12-12T10:00:00',
        reason: 'db-verification test',
      });
    expect(created.status).toBe(201);

    const row = await queryOne<{
      patient_id: number;
      doctor_id: number;
      reason: string;
      status: string;
    }>('SELECT * FROM appointments WHERE id = ?', [created.body.appointmentId]);

    expect(row).toBeDefined();
    expect(row!.patient_id).toBe(patient.id);
    expect(row!.doctor_id).toBe(doctor.id);
    expect(row!.reason).toBe('db-verification test');
    expect(row!.status).toBe('scheduled'); // the column's default, confirmed at the storage layer
  });

  it('updates a medical record through the API and confirms the diagnosis column changed in SQLite', async () => {
    const doctor = await loginAs('Doctor');
    const patient = await getFirstUserWithRole('Patient');

    const created = await api()
      .post('/api/medical-records')
      .set(authHeader(doctor.token))
      .send({ patient_id: patient.id, diagnosis: 'pre-update diagnosis' });
    expect(created.status).toBe(201);

    const updated = await api()
      .put(`/api/medical-records/${created.body.recordId}`)
      .set(authHeader(doctor.token))
      .send({ diagnosis: 'post-update diagnosis' });
    expect(updated.status).toBe(200);

    const row = await queryOne<{ diagnosis: string; updated_at: string }>(
      'SELECT * FROM medical_records WHERE id = ?',
      [created.body.recordId],
    );

    expect(row).toBeDefined();
    expect(row!.diagnosis).toBe('post-update diagnosis');
    expect(row!.updated_at).toBeTruthy();
  });
});
