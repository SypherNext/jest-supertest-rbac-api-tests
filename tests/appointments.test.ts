// tests/appointments.test.ts
//
// Full CRUD lifecycle for /api/appointments, plus the field-name contract
// (snake_case: patient_id, doctor_id, appointment_date) and the real
// response shape of a create call: {message, appointmentId} only -- the
// full record needs a separate GET.

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';
import type { Appointment, CreateAppointmentResponse } from '../types';

describe('appointment CRUD lifecycle', () => {
  it('creates, reads, updates, and deletes an appointment end to end', async () => {
    const admin = await loginAs('Administrator');
    const patient = await getFirstUserWithRole('Patient');
    const doctor = await getFirstUserWithRole('Doctor');

    const created = await api()
      .post('/api/appointments')
      .set(authHeader(admin.token))
      .send({
        patient_id: patient.id,
        doctor_id: doctor.id,
        appointment_date: '2026-12-01T10:00:00',
        reason: 'jest-supertest-rbac-api-tests lifecycle test',
      });

    expect(created.status).toBe(201);
    const createBody = created.body as CreateAppointmentResponse;
    expect(createBody).toHaveProperty('appointmentId');
    expect(createBody.message).toBe('Appointment created successfully');
    // The create response is message + appointmentId only -- no snake_case
    // fields of the record itself come back here, on purpose.
    expect(createBody).not.toHaveProperty('patient_id');

    const appointmentId = createBody.appointmentId;

    const fetched = await api()
      .get(`/api/appointments/${appointmentId}`)
      .set(authHeader(admin.token));
    expect(fetched.status).toBe(200);
    const record = fetched.body as Appointment;
    expect(record.patient_id).toBe(patient.id);
    expect(record.doctor_id).toBe(doctor.id);
    expect(record.status).toBe('scheduled'); // the column's default

    const updated = await api()
      .put(`/api/appointments/${appointmentId}`)
      .set(authHeader(admin.token))
      .send({ status: 'completed' });
    expect(updated.status).toBe(200);

    const afterUpdate = await api()
      .get(`/api/appointments/${appointmentId}`)
      .set(authHeader(admin.token));
    expect(afterUpdate.body.status).toBe('completed');

    const deleted = await api()
      .delete(`/api/appointments/${appointmentId}`)
      .set(authHeader(admin.token));
    expect(deleted.status).toBe(200);

    const afterDelete = await api()
      .get(`/api/appointments/${appointmentId}`)
      .set(authHeader(admin.token));
    expect(afterDelete.status).toBe(404);
  });

  it('a Nurse can create and update an appointment (allowed), but not delete one (denied)', async () => {
    const nurse = await loginAs('Nurse');
    const patient = await getFirstUserWithRole('Patient');
    const doctor = await getFirstUserWithRole('Doctor');

    const created = await api()
      .post('/api/appointments')
      .set(authHeader(nurse.token))
      .send({
        patient_id: patient.id,
        doctor_id: doctor.id,
        appointment_date: '2026-12-02T09:00:00',
        reason: 'nurse create/update check',
      });
    expect(created.status).toBe(201);

    const updated = await api()
      .put(`/api/appointments/${created.body.appointmentId}`)
      .set(authHeader(nurse.token))
      .send({ status: 'completed' });
    // Real, verified divergence: this app does not restrict
    // PUT /api/appointments/:id to Doctor-only, even though that might be
    // the intuitive rule -- a Nurse can set status to "completed" here.
    expect(updated.status).toBe(200);

    const deleted = await api()
      .delete(`/api/appointments/${created.body.appointmentId}`)
      .set(authHeader(nurse.token));
    expect(deleted.status).toBe(403);
  });

  it('GET /api/appointments scopes a Patient to only their own rows', async () => {
    const patient = await loginAs('Patient');
    const response = await api().get('/api/appointments').set(authHeader(patient.token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    for (const appt of response.body as Appointment[]) {
      expect(appt.patient_id).toBe(patient.userId);
    }
  });
});
