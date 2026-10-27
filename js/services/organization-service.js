import { assertCapability } from '../permissions.js';

function orgCollection(db, orgId, collectionName) {
  return `organizations/${orgId}/${collectionName}`;
}

export async function loadOrganizationWorkspace(runtime, identity) {
  if (!identity?.organizationId) throw new Error('Your account is not assigned to an organization.');
  const { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, where } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  const orgRef = doc(runtime.db, 'organizations', identity.organizationId);
  const sitesRef = collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'sites'));
  const departmentsRef = collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'departments'));
  const siteQuery = identity.role === 'admin'
    ? query(sitesRef, limit(100))
    : identity.siteIds.length ? query(sitesRef, where(documentId(), 'in', identity.siteIds.slice(0, 30)), limit(100)) : null;
  const departmentQuery = identity.role === 'admin'
    ? query(departmentsRef, limit(100))
    : identity.siteIds.length ? query(departmentsRef, where('siteId', 'in', identity.siteIds.slice(0, 30)), limit(100)) : null;
  const memberRef = collection(runtime.db, 'users');
  const memberQuery = identity.role === 'admin'
    ? query(memberRef, where('organizationId', '==', identity.organizationId), limit(100))
    : identity.role === 'supervisor' && identity.siteIds.length
      ? query(memberRef, where('organizationId', '==', identity.organizationId), where('siteIds', 'array-contains-any', identity.siteIds.slice(0, 10)), limit(100))
      : null;
  const [orgSnapshot, siteSnapshot, departmentSnapshot, memberSnapshot] = await Promise.all([
    getDoc(orgRef),
    siteQuery ? getDocs(siteQuery) : Promise.resolve({ docs: [] }),
    departmentQuery ? getDocs(departmentQuery) : Promise.resolve({ docs: [] }),
    memberQuery ? getDocs(memberQuery) : Promise.resolve({ docs: [] })
  ]);
  if (!orgSnapshot.exists()) throw new Error('Your organization record was not found. Ask your administrator to check access.');

  const shiftsRef = collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'shifts'));
  const attendanceRef = collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'attendance'));
  const reportsRef = collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'safetyReports'));
  const scopedQuery = (ref, workerField) => {
    if (identity.role === 'worker') return query(ref, where(workerField, '==', identity.uid), limit(100));
    if (identity.role === 'supervisor') {
      if (!identity.siteIds.length) return null;
      return query(ref, where('siteId', 'in', identity.siteIds.slice(0, 30)), limit(100));
    }
    return query(ref, orderBy('createdAt', 'desc'), limit(100));
  };
  const shiftQuery = identity.role === 'worker'
    ? query(shiftsRef, where('workerUids', 'array-contains', identity.uid), limit(100))
    : identity.role === 'supervisor' && identity.siteIds.length
      ? query(shiftsRef, where('siteId', 'in', identity.siteIds.slice(0, 30)), limit(100))
      : identity.role === 'admin' ? query(shiftsRef, limit(100)) : null;
  const attendanceQuery = scopedQuery(attendanceRef, 'workerUid');
  const reportQuery = identity.role === 'worker'
    ? query(reportsRef, where('reporterUid', '==', identity.uid), limit(100))
    : scopedQuery(reportsRef, 'reporterUid');
  const [shiftSnapshot, attendanceSnapshot, reportSnapshot] = await Promise.all([
    shiftQuery ? getDocs(shiftQuery) : Promise.resolve({ docs: [] }),
    attendanceQuery ? getDocs(attendanceQuery) : Promise.resolve({ docs: [] }),
    reportQuery ? getDocs(reportQuery) : Promise.resolve({ docs: [] })
  ]);
  const records = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  return {
    organization: { id: orgSnapshot.id, ...orgSnapshot.data() },
    sites: records(siteSnapshot), departments: records(departmentSnapshot),
    shifts: records(shiftSnapshot), attendance: records(attendanceSnapshot), safetyReports: records(reportSnapshot),
    members: memberSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  };
}

export async function createOrganizationRecord(runtime, identity, collectionName, data) {
  assertCapability(identity, collectionName === 'shifts' ? 'shift:manage' : 'organization:manage');
  const allowed = new Set(['sites', 'departments', 'shifts']);
  if (!allowed.has(collectionName)) throw new Error('That organization record type cannot be created here.');
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  return addDoc(collection(runtime.db, orgCollection(runtime.db, identity.organizationId, collectionName)), {
    ...data, organizationId: identity.organizationId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function updateOrganizationRecord(runtime, identity, collectionName, id, changes) {
  assertCapability(identity, collectionName === 'shifts' ? 'shift:manage' : 'organization:manage');
  if (!['sites', 'departments'].includes(collectionName)) throw new Error('That organization record type cannot be edited here.');
  const { doc, serverTimestamp, updateDoc } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  return updateDoc(doc(runtime.db, `organizations/${identity.organizationId}/${collectionName}`, id), {
    name: changes.name.trim(), updatedAt: serverTimestamp()
  });
}

export async function updateOrganization(runtime, identity, changes) {
  assertCapability(identity, 'organization:manage');
  const { doc, serverTimestamp, updateDoc } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  return updateDoc(doc(runtime.db, 'organizations', identity.organizationId), {
    name: changes.name.trim(), industry: changes.industry, updatedAt: serverTimestamp()
  });
}

export async function updateShiftStatus(runtime, identity, shift, status) {
  assertCapability(identity, 'shift:manage');
  if (!['scheduled', 'cancelled', 'complete'].includes(status)) throw new Error('Shift status is invalid.');
  if (identity.mode === 'demo') { shift.status = status; return; }
  const { doc, serverTimestamp, updateDoc } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  return updateDoc(doc(runtime.db, `organizations/${identity.organizationId}/shifts`, shift.id), {
    status, updatedAt: serverTimestamp()
  });
}

export async function createSafetyReport(runtime, identity, report) {
  assertCapability(identity, 'report:create');
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
  return addDoc(collection(runtime.db, orgCollection(runtime.db, identity.organizationId, 'safetyReports')), {
    organizationId: identity.organizationId, reporterUid: identity.uid,
    title: report.title.trim(), description: report.description.trim(), category: report.category,
    severity: report.severity, siteId: report.siteId, status: 'open',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function recordCloudAttendance(runtime, identity, shiftId, action) {
  assertCapability(identity, 'attendance:self');
  const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js');
  const submit = httpsCallable(getFunctions(runtime.app), 'recordAttendance');
  return submit({ shiftId, action });
}

export async function provisionMember(runtime, identity, input) {
  assertCapability(identity, 'member:provision');
  const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js');
  const submit = httpsCallable(getFunctions(runtime.app), 'provisionOrganizationMember');
  return submit(input);
}

export async function transitionCloudSafetyReport(runtime, identity, reportId, status, note = '') {
  assertCapability(identity, 'report:review');
  const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js');
  const submit = httpsCallable(getFunctions(runtime.app), 'transitionSafetyReport');
  return submit({ reportId, status, note });
}
