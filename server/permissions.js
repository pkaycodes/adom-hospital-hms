export const ROLE_LABELS = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  cashier: 'Cashier',
  pharmacist: 'Pharmacist',
  lab: 'Laboratory Technician',
  receptionist: 'Receptionist',
  other: 'Other staff',
};

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  doctor: [
    'dashboard.view',
    'patients.view',
    'visits.view',
    'consultation.manage',
    'labs.request',
    'prescriptions.manage',
    'billing.view',
    'services.view',
  ],
  nurse: ['dashboard.view', 'patients.view', 'visits.view', 'vitals.manage'],
  cashier: [
    'dashboard.view',
    'patients.view',
    'visits.view',
    'billing.view',
    'billing.manage',
    'payments.manage',
    'finance.view',
  ],
  pharmacist: [
    'dashboard.view',
    'patients.view',
    'visits.view',
    'prescriptions.dispense',
    'medications.manage',
  ],
  lab: ['dashboard.view', 'patients.view', 'visits.view', 'labs.manage'],
  receptionist: [
    'dashboard.view',
    'patients.view',
    'patients.manage',
    'visits.manage',
    'visits.view',
    'billing.view',
  ],
  other: ['dashboard.view', 'patients.view', 'patients.manage', 'visits.manage', 'visits.view'],
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.other;
}

export function hasPermission(role, permission) {
  const perms = permissionsFor(role);
  return perms.includes('*') || perms.includes(permission);
}
