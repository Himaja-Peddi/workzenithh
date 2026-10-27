export const ROLES = Object.freeze({ WORKER: 'worker', SUPERVISOR: 'supervisor', ADMIN: 'admin' });

const roleCapabilities = Object.freeze({
  worker: new Set(['read:self', 'attendance:self', 'report:create', 'grievance:create', 'feedback:create', 'skills:self']),
  supervisor: new Set(['read:self', 'attendance:self', 'report:create', 'grievance:create', 'feedback:create', 'skills:self', 'read:team', 'attendance:team', 'report:review', 'report:escalate']),
  admin: new Set(['read:self', 'attendance:self', 'report:create', 'grievance:create', 'feedback:create', 'skills:self', 'read:team', 'attendance:team', 'report:review', 'report:escalate', 'organization:manage', 'shift:manage', 'member:provision', 'payroll:manage', 'analytics:read', 'audit:read'])
});

export function hasCapability(identity, capability) {
  return Boolean(identity?.role && roleCapabilities[identity.role]?.has(capability));
}

export function canReadSite(identity, siteId) {
  if (!identity || !siteId) return false;
  if (identity.role === ROLES.ADMIN) return true;
  return Array.isArray(identity.siteIds) && identity.siteIds.includes(siteId);
}

export function canReadWorker(identity, workerUid, siteId) {
  if (!identity || !workerUid) return false;
  if (identity.uid === workerUid) return true;
  return identity.role === ROLES.ADMIN || (identity.role === ROLES.SUPERVISOR && canReadSite(identity, siteId));
}

export function assertCapability(identity, capability) {
  if (!hasCapability(identity, capability)) throw new Error('Your account is not authorized for this action.');
}
