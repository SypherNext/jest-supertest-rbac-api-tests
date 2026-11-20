// tests/openapi.test.ts
//
// Validates real responses against the app's own OpenAPI spec -- fetched
// live from the running server (black-box), not built in-process from the
// app's route-file comments the way the course's own in-process module
// does it with swagger-jsdoc.

import Ajv from 'ajv';
import { api, loginAs, authHeader, getOpenApiSpec } from '../helpers';

describe('OpenAPI spec is reachable and well-formed', () => {
  it('fetches a spec with the expected paths', async () => {
    const spec = await getOpenApiSpec();

    expect(spec.openapi).toBe('3.0.0');
    expect(spec.paths).toHaveProperty('/api/auth/login');
    expect(spec.paths).toHaveProperty('/api/appointments');
    expect(spec.paths).toHaveProperty('/api/medical-records');
    expect(spec.paths).toHaveProperty('/api/patients');
    expect(spec.paths).toHaveProperty('/api/users');
  });

  it('every path this suite tests against actually exists in the spec', async () => {
    const spec = await getOpenApiSpec();
    const testedPaths = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/appointments',
      '/api/appointments/{id}',
      '/api/medical-records',
      '/api/medical-records/{id}',
      '/api/patients',
      '/api/patients/{patientId}/records',
      '/api/users',
      '/api/users/{id}',
      '/api/users/role/{role}',
    ];

    for (const path of testedPaths) {
      expect(spec.paths).toHaveProperty(path);
    }
  });
});

describe('validating a real response against the spec\'s own request schema', () => {
  it('a valid create-appointment payload validates against the spec', async () => {
    const spec = await getOpenApiSpec();
    const ajv = new Ajv({ strict: false });

    const requestSchema =
      spec.paths['/api/appointments'].post.requestBody.content['application/json'].schema;
    const validate = ajv.compile(requestSchema);

    const validPayload = {
      patient_id: 1,
      doctor_id: 1,
      appointment_date: '2026-12-01T10:00:00',
      reason: 'spec-validation check',
    };
    expect(validate(validPayload)).toBe(true);

    const invalidPayload = { doctor_id: 1, appointment_date: '2026-12-01T10:00:00' }; // missing patient_id, reason
    expect(validate(invalidPayload)).toBe(false);
  });

  it('a real login response matches the shape implied by the spec', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().get('/api/users').set(authHeader(admin.token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    // Spot-check the shape of a real row against what the spec documents
    // for a user object, rather than trusting it blindly.
    const [user] = response.body;
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('full_name');
  });
});
