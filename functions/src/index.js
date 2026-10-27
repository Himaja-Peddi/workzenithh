const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();

function identityOf(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const { uid, token } = request.auth;
  if (!['worker', 'supervisor', 'admin'].includes(token.role) || !token.organizationId) {
    throw new HttpsError('permission-denied', 'Your account has not been provisioned for an organization.');
  }
  return { uid, role: token.role, organizationId: token.organizationId, siteIds: token.siteIds || [], departmentIds: token.departmentIds || [] };
}

function requireAdmin(identity) {
  if (identity.role !== 'admin') throw new HttpsError('permission-denied', 'Organization administrator access is required.');
}

exports.provisionOrganizationMember = onCall(async (request) => {
  const actor = identityOf(request);
  requireAdmin(actor);
  const { targetUid, role, siteIds = [], departmentIds = [] } = request.data || {};
  if (typeof targetUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === actor.uid) {
    throw new HttpsError('invalid-argument', 'Provide another existing Authentication UID.');
  }
  if (!['worker', 'supervisor'].includes(role)) {
    throw new HttpsError('invalid-argument', 'This workflow can provision workers or supervisors only. Administrator grants use the trusted bootstrap process.');
  }
  if (!Array.isArray(siteIds) || siteIds.length > 30 || !Array.isArray(departmentIds) || departmentIds.length > 50) {
    throw new HttpsError('invalid-argument', 'Site or department assignment is invalid.');
  }
  const orgRef = db.collection('organizations').doc(actor.organizationId);
  const siteSnapshots = await Promise.all(siteIds.map((id) => orgRef.collection('sites').doc(id).get()));
  const departmentSnapshots = await Promise.all(departmentIds.map((id) => orgRef.collection('departments').doc(id).get()));
  if (siteSnapshots.some((snapshot) => !snapshot.exists) || departmentSnapshots.some((snapshot) => !snapshot.exists)) {
    throw new HttpsError('invalid-argument', 'Assignments must belong to this organization.');
  }
  if (departmentSnapshots.some((snapshot) => !siteIds.includes(snapshot.data().siteId))) {
    throw new HttpsError('invalid-argument', 'Each department assignment must be within an assigned site.');
  }

  let target;
  try { target = await getAuth().getUser(targetUid); }
  catch { throw new HttpsError('not-found', 'The target account does not exist.'); }
  if (target.customClaims?.role === 'admin') throw new HttpsError('failed-precondition', 'Administrator access cannot be changed through member provisioning.');
  if (target.customClaims?.organizationId && target.customClaims.organizationId !== actor.organizationId) {
    throw new HttpsError('failed-precondition', 'The account is already assigned to another organization. Use the trusted account-transfer process.');
  }
  const existingProfile = await db.collection('users').doc(targetUid).get();
  if (existingProfile.exists && existingProfile.data().organizationId !== actor.organizationId) {
    throw new HttpsError('failed-precondition', 'The account is already assigned to another organization. Use the trusted account-transfer process.');
  }
  await getAuth().setCustomUserClaims(targetUid, {
    ...(target.customClaims || {}), role, organizationId: actor.organizationId,
    siteIds: [...new Set(siteIds)], departmentIds: [...new Set(departmentIds)]
  });
  await db.collection('users').doc(targetUid).set({
    uid: targetUid, displayName: target.displayName || '', role, organizationId: actor.organizationId,
    siteIds: [...new Set(siteIds)], departmentIds: [...new Set(departmentIds)],
    status: 'active', updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await orgRef.collection('auditLogs').add({
    actorUid: actor.uid, action: 'member.provisioned', targetUid, role,
    createdAt: FieldValue.serverTimestamp()
  });
  return { uid: targetUid, role, organizationId: actor.organizationId };
});

exports.recordAttendance = onCall(async (request) => {
  const actor = identityOf(request);
  if (actor.role !== 'worker') throw new HttpsError('permission-denied', 'Worker access is required for personal attendance actions.');
  const { shiftId, action } = request.data || {};
  if (typeof shiftId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(shiftId) || !['checkIn', 'checkOut'].includes(action)) {
    throw new HttpsError('invalid-argument', 'A valid shift and attendance action are required.');
  }
  const orgRef = db.collection('organizations').doc(actor.organizationId);
  const shiftRef = orgRef.collection('shifts').doc(shiftId);
  const shiftSnapshot = await shiftRef.get();
  if (!shiftSnapshot.exists) throw new HttpsError('not-found', 'Shift not found.');
  const shift = shiftSnapshot.data();
  if (!Array.isArray(shift.workerUids) || !shift.workerUids.includes(actor.uid) || !actor.siteIds.includes(shift.siteId)) {
    throw new HttpsError('permission-denied', 'This shift is not assigned to your account.');
  }
  if (shift.status === 'cancelled') throw new HttpsError('failed-precondition', 'This shift is cancelled.');
  const attendanceRef = orgRef.collection('attendance').doc(`${shiftId}_${actor.uid}`);
  let newStatus;
  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(attendanceRef);
    const current = currentSnapshot.exists ? currentSnapshot.data() : null;
    if (action === 'checkIn') {
      if (current?.checkInAt) throw new HttpsError('already-exists', 'A check-in is already recorded for this shift.');
      newStatus = 'checked_in';
      transaction.set(attendanceRef, {
        organizationId: actor.organizationId, workerUid: actor.uid, shiftId,
        siteId: shift.siteId, departmentId: shift.departmentId || null,
        checkInAt: FieldValue.serverTimestamp(), checkOutAt: null,
        status: newStatus, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      if (!current?.checkInAt || current.checkOutAt) throw new HttpsError('failed-precondition', 'Check in first; this shift may already be checked out.');
      const checkInMillis = typeof current.checkInAt.toMillis === 'function' ? current.checkInAt.toMillis() : 0;
      const recordedMinutes = Math.max(0, Math.floor((Date.now() - checkInMillis) / 60000));
      newStatus = 'checked_out';
      transaction.update(attendanceRef, {
        checkOutAt: FieldValue.serverTimestamp(), status: newStatus,
        recordedMinutes,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    transaction.create(orgRef.collection('auditLogs').doc(), {
      actorUid: actor.uid, action: `attendance.${action}`, shiftId,
      attendanceId: attendanceRef.id, createdAt: FieldValue.serverTimestamp()
    });
  });
  return { attendanceId: attendanceRef.id, status: newStatus };
});

exports.transitionSafetyReport = onCall(async (request) => {
  const actor = identityOf(request);
  if (!['supervisor', 'admin'].includes(actor.role)) throw new HttpsError('permission-denied', 'Supervisor access is required.');
  const { reportId, status, note = '' } = request.data || {};
  const allowedStatuses = ['acknowledged', 'in_progress', 'escalated', 'resolved'];
  if (typeof reportId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reportId) || !allowedStatuses.includes(status) || typeof note !== 'string' || note.length > 1000) {
    throw new HttpsError('invalid-argument', 'Report update is invalid.');
  }
  const orgRef = db.collection('organizations').doc(actor.organizationId);
  const reportRef = orgRef.collection('safetyReports').doc(reportId);
  await db.runTransaction(async (transaction) => {
    const reportSnapshot = await transaction.get(reportRef);
    if (!reportSnapshot.exists) throw new HttpsError('not-found', 'Safety report not found.');
    const report = reportSnapshot.data();
    if (actor.role === 'supervisor' && !actor.siteIds.includes(report.siteId)) throw new HttpsError('permission-denied', 'This site is outside your assignment.');
    if (Array.isArray(report.statusHistory) && report.statusHistory.length >= 100) throw new HttpsError('resource-exhausted', 'This report has reached its status history limit.');
    const validNext = {
      open: ['acknowledged', 'escalated'], acknowledged: ['in_progress', 'escalated', 'resolved'],
      in_progress: ['escalated', 'resolved'], escalated: ['in_progress', 'resolved']
    };
    if (!validNext[report.status]?.includes(status)) throw new HttpsError('failed-precondition', 'That report status transition is not allowed.');
    const event = { status, note: note.trim(), actorUid: actor.uid, createdAt: new Date().toISOString() };
    transaction.update(reportRef, {
      status, updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion(event)
    });
    transaction.create(orgRef.collection('auditLogs').doc(), {
      actorUid: actor.uid, action: 'safetyReport.statusChanged', reportId,
      fromStatus: report.status, toStatus: status, createdAt: FieldValue.serverTimestamp()
    });
  });
  return { reportId, status };
});
