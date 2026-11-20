// helpers.ts
//
// Shared test infrastructure for the whole suite. This is a black-box test
// project: every helper here talks to the real, already-running
// rbac-healthcare-system server over real HTTP, using `supertest(BASE_URL)`
// with a base URL string -- never `supertest(app)` against an imported
// Express app object. There is no server code imported anywhere in this
// repository, on purpose: that is what makes this suite black-box rather
// than in-process.

import request from 'supertest';
import sqlite3 from 'sqlite3';
import path from 'path';
import type { LoginResponse, Role, UserSummary } from './types';

export const BASE_URL = process.env.RBAC_BASE_URL || 'http://localhost:5000';

export function api() {
  return request(BASE_URL);
}

export interface Session {
  token: string;
  userId: number;
  username: string;
  role: Role;
}

const CREDENTIALS: Record<Role, { username: string; password: string }> = {
  Administrator: { username: 'admin', password: 'admin123' },
  Doctor: { username: 'doctor1', password: 'pass@123' },
  Nurse: { username: 'nurse1', password: 'pass@123' },
  Patient: { username: 'patient1', password: 'pass@123' },
};

// Logging in is a real HTTP round trip, same as everything else in this
// suite -- cached per role for the lifetime of the test process so a suite
// with dozens of tests doesn't log in from scratch every single time.
const sessionCache = new Map<Role, Promise<Session>>();

async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await api().post('/api/auth/login').send({ username, password });
  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${username}: expected 200, got ${response.status} (${JSON.stringify(response.body)})`,
    );
  }
  return response.body as LoginResponse;
}

export function loginAs(role: Role): Promise<Session> {
  const cached = sessionCache.get(role);
  if (cached) return cached;

  const { username, password } = CREDENTIALS[role];
  const sessionPromise = login(username, password).then((body) => ({
    token: body.token,
    userId: body.user.id,
    username: body.user.username,
    role: body.user.role,
  }));

  sessionCache.set(role, sessionPromise);
  return sessionPromise;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// A fixture helper, same pattern the course itself builds: look a seeded
// user up by role instead of hardcoding an ID, because this app's SQLite
// AUTOINCREMENT column means seeded IDs are not stable across reseeds.
export async function getFirstUserWithRole(role: Role): Promise<UserSummary> {
  const admin = await loginAs('Administrator');
  const response = await api().get(`/api/users/role/${role}`).set(authHeader(admin.token));

  if (response.status !== 200 || !Array.isArray(response.body) || response.body.length === 0) {
    throw new Error(`No seeded users found with role ${role} (status ${response.status})`);
  }

  return response.body[0] as UserSummary;
}

// --- Direct database verification -----------------------------------------
//
// Being black-box over HTTP doesn't mean giving up on verifying state at
// the storage layer -- it just means this helper opens its own connection
// to the same SQLite file the server reads and writes, from a separate
// process, rather than importing the app to share its process. Point
// RBAC_DB_PATH at your own checkout of rbac-healthcare-system if it isn't a
// sibling directory of this repo.
const DEFAULT_DB_PATH = path.join(
  __dirname,
  '..',
  'rbac-healthcare-system',
  'backend',
  'database',
  'rbac.db',
);
export const DB_PATH = process.env.RBAC_DB_PATH || DEFAULT_DB_PATH;

export function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`Could not open ${DB_PATH}: ${err.message}. Set RBAC_DB_PATH if rbac-healthcare-system isn't a sibling checkout.`));
      }
    });
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

export function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`Could not open ${DB_PATH}: ${err.message}. Set RBAC_DB_PATH if rbac-healthcare-system isn't a sibling checkout.`));
      }
    });
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

// --- Fetching the real OpenAPI spec, black-box style -----------------------
//
// The course's own in-process OpenAPI module calls swagger-jsdoc directly,
// because it has the app's source available in the same process. This
// suite doesn't import the app at all, so it gets the same spec the honest
// black-box way instead: by fetching it from the live server, the same way
// a browser loading the Swagger UI does, and extracting the embedded
// `swaggerDoc` object out of swagger-ui-init.js.
let cachedSpec: any | null = null;

export async function getOpenApiSpec(): Promise<any> {
  if (cachedSpec) return cachedSpec;

  const response = await api().get('/api-docs/swagger-ui-init.js');
  if (response.status !== 200) {
    throw new Error(`Could not fetch swagger-ui-init.js: status ${response.status}`);
  }

  const body: string = response.text;
  const marker = '"swaggerDoc":';
  const markerIdx = body.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error('swaggerDoc marker not found in swagger-ui-init.js');
  }

  const braceStart = body.indexOf('{', markerIdx + marker.length);
  if (braceStart === -1) {
    throw new Error('Could not locate start of swaggerDoc object');
  }

  // A small string-aware brace counter: walks forward from the opening
  // brace, tracking nesting depth, while ignoring braces that appear inside
  // string literals (descriptions, examples, etc. can legitimately contain
  // "{" or "}" characters).
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = braceStart; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    throw new Error('Could not find matching closing brace for swaggerDoc object');
  }

  const jsonText = body.slice(braceStart, endIdx + 1);
  cachedSpec = JSON.parse(jsonText);
  return cachedSpec;
}
