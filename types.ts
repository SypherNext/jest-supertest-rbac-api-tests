// types.ts
//
// Typed request/response shapes for the real, running rbac-healthcare-system
// backend. Every field name here is deliberately snake_case, matching the
// app's actual JSON wire format -- not the camelCase you might expect from a
// typical JS/TS convention. Verified directly against the live server's
// responses, not guessed from the Swagger descriptions alone.

export type Role = 'Administrator' | 'Doctor' | 'Nurse' | 'Patient';

export interface UserSummary {
  id: number;
  username: string;
  email: string;
  role: Role;
  full_name: string;
  phone?: string | null;
  created_at?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserSummary;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: Role;
  full_name: string;
  phone?: string;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export interface CreateAppointmentRequest {
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  reason: string;
  notes?: string;
}

export interface CreateAppointmentResponse {
  message: string;
  appointmentId: number;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  status: AppointmentStatus;
  reason: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient_name?: string;
  doctor_name?: string;
}

export interface UpdateAppointmentRequest {
  appointment_date?: string;
  status?: AppointmentStatus;
  notes?: string;
}

export interface CreateMedicalRecordRequest {
  patient_id: number;
  diagnosis: string;
  prescription?: string;
  notes?: string;
}

export interface MedicalRecord {
  id: number;
  patient_id: number;
  doctor_id: number;
  diagnosis: string;
  prescription: string | null;
  notes: string | null;
  visit_date: string;
  created_at: string;
  updated_at: string;
  patient_name?: string;
  doctor_name?: string;
}

export interface UpdateMedicalRecordRequest {
  diagnosis?: string;
  prescription?: string;
  notes?: string;
}

export interface UpdateUserRequest {
  full_name?: string;
  phone?: string;
  email?: string;
}

export interface ApiErrorBody {
  error: string;
  requiredRoles?: Role[];
  userRole?: Role;
}

export interface ValidationErrorBody {
  errors: Array<{
    type: string;
    value?: unknown;
    msg: string;
    path: string;
    location: string;
  }>;
}
