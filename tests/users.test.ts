// tests/users.test.ts
//
// This is this repository's capstone suite, mirroring the course's own
// capstone-api-automation lesson: full coverage of /api/users, built
// entirely from patterns already established in the other test files --
// RBAC matrix, ownership checks, CRUD with a read-after-write check, and
// negative cases -- applied end to end against one previously
// under-tested area of the app.
//
// Real, verified rules this suite checks:
//   GET /api/users              -- Administrator only
//   GET /api/users/:id          -- an Administrator can view anyone;
//                                   anyone else, only their own profile
//   PUT /api/users/:id          -- same ownership rule as viewing
//   DELETE /api/users/:id       -- Administrator only
//   GET /api/users/role/:role   -- any authenticated user

import { api, loginAs, authHeader, getFirstUserWithRole } from '../helpers';

describe('GET /api/users (list) -- Administrator only', () => {
  it.each([
    ['Administrator', 200],
    ['Doctor', 403],
    ['Nurse', 403],
    ['Patient', 403],
  ] as const)('%s gets %i', async (role, expectedStatus) => {
    const session = await loginAs(role);
    const response = await api().get('/api/users').set(authHeader(session.token));
    expect(response.status).toBe(expectedStatus);
  });

  it('rejects a request with no token at all', async () => {
    const response = await api().get('/api/users');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Access token required');
  });
});

describe('GET /api/users/:id -- ownership', () => {
  it('lets a user view their own profile', async () => {
    const patient = await loginAs('Patient');
    const response = await api().get(`/api/users/${patient.userId}`).set(authHeader(patient.token));

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(patient.userId);
  });

  it('blocks a user from viewing someone else\'s profile', async () => {
    const patient = await loginAs('Patient');
    const admin = await getFirstUserWithRole('Administrator');

    const response = await api().get(`/api/users/${admin.id}`).set(authHeader(patient.token));
    expect(response.status).toBe(403);
  });

  it('lets an Administrator view anyone\'s profile', async () => {
    const admin = await loginAs('Administrator');
    const patient = await getFirstUserWithRole('Patient');

    const response = await api().get(`/api/users/${patient.id}`).set(authHeader(admin.token));
    expect(response.status).toBe(200);
  });

  it('returns 404 for a user ID that does not exist', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().get('/api/users/999999').set(authHeader(admin.token));
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/users/:id', () => {
  it('updates and persists a profile change for your own account', async () => {
    const patient = await loginAs('Patient');
    const uniqueSuffix = Date.now();
    const self = await api().get(`/api/users/${patient.userId}`).set(authHeader(patient.token));

    // All three fields are sent deliberately -- see the "real gap" test
    // below for why full_name and email can't safely be omitted here,
    // despite the OpenAPI spec documenting all three as optional.
    const updated = await api()
      .put(`/api/users/${patient.userId}`)
      .set(authHeader(patient.token))
      .send({ full_name: `Updated Name ${uniqueSuffix}`, phone: '555-0000', email: self.body.email });
    expect(updated.status).toBe(200);

    const fetched = await api().get(`/api/users/${patient.userId}`).set(authHeader(patient.token));
    expect(fetched.body.full_name).toBe(`Updated Name ${uniqueSuffix}`);
    expect(fetched.body.phone).toBe('555-0000');
  });

  it('blocks a user from updating someone else\'s profile', async () => {
    const patient = await loginAs('Patient');
    const admin = await getFirstUserWithRole('Administrator');

    const response = await api()
      .put(`/api/users/${admin.id}`)
      .set(authHeader(patient.token))
      .send({ full_name: 'Hijacked Name' });

    expect(response.status).toBe(403);
  });

  it('omitting full_name or email now works, matching the spec marking both optional', async () => {
    const patient = await loginAs('Patient');
    const self = await api().get(`/api/users/${patient.userId}`).set(authHeader(patient.token));

    // phone-only: used to be a real gap -- the route's UPDATE statement
    // didn't tolerate a missing full_name/email even though the spec marks
    // both optional, and crashed with a raw 500. Fixed: the update now only
    // touches whichever fields were actually provided.
    const phoneOnly = await api()
      .put(`/api/users/${patient.userId}`)
      .set(authHeader(patient.token))
      .send({ phone: '555-1234' });
    expect(phoneOnly.status).toBe(200);

    // full_name + email together still succeeds.
    const withoutPhone = await api()
      .put(`/api/users/${patient.userId}`)
      .set(authHeader(patient.token))
      .send({ full_name: 'Has Name And Email', email: self.body.email });
    expect(withoutPhone.status).toBe(200);
  });
});

describe('DELETE /api/users/:id -- Administrator only', () => {
  it.each([
    ['Doctor', 403],
    ['Nurse', 403],
    ['Patient', 403],
  ] as const)('%s cannot delete a user (%i)', async (role, expectedStatus) => {
    const session = await loginAs(role);
    const response = await api().delete('/api/users/999999').set(authHeader(session.token));
    expect(response.status).toBe(expectedStatus);
  });

  it('an Administrator reaches the role check and gets a clean 404 for a nonexistent user', async () => {
    const admin = await loginAs('Administrator');
    const response = await api().delete('/api/users/999999').set(authHeader(admin.token));
    expect(response.status).toBe(404);
  });
});

describe('GET /api/users/role/:role -- open to any authenticated user', () => {
  it.each(['Administrator', 'Doctor', 'Nurse', 'Patient'] as const)(
    '%s can list users filtered by role',
    async (role) => {
      const session = await loginAs(role);
      const response = await api().get('/api/users/role/Doctor').set(authHeader(session.token));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      for (const user of response.body) {
        expect(user.role).toBe('Doctor');
      }
    },
  );
});
