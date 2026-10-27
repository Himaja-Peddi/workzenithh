import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, where, query, documentId } from 'firebase/firestore';

const projectId = 'demo-workzenith';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const docs = [
      ['organizations/org-a', { name: 'Construction sample', industry: 'construction' }],
      ['organizations/org-b', { name: 'College sample', industry: 'education' }],
      ['organizations/org-a/sites/site-a', { organizationId: 'org-a', name: 'Site A', industry: 'construction' }],
      ['organizations/org-a/sites/site-b', { organizationId: 'org-a', name: 'Site B', industry: 'construction' }],
      ['organizations/org-b/sites/campus-a', { organizationId: 'org-b', name: 'Campus A', industry: 'education' }],
      ['organizations/org-a/shifts/shift-a', { organizationId: 'org-a', title: 'Day shift', siteId: 'site-a', departmentId: 'ops', workerUids: ['worker-a'] }],
      ['organizations/org-a/attendance/att-a', { organizationId: 'org-a', workerUid: 'worker-a', shiftId: 'shift-a', siteId: 'site-a', status: 'checked_in' }],
      ['organizations/org-a/attendance/att-b', { organizationId: 'org-a', workerUid: 'worker-b', shiftId: 'shift-b', siteId: 'site-b', status: 'checked_in' }],
      ['organizations/org-a/payrollRecords/pay-a', { organizationId: 'org-a', workerUid: 'worker-a', netAmount: 100 }],
      ['organizations/org-a/payrollRecords/pay-b', { organizationId: 'org-a', workerUid: 'worker-b', netAmount: 200 }],
      ['users/worker-a', { uid: 'worker-a', organizationId: 'org-a', role: 'worker', siteIds: ['site-a'], language: 'en' }]
    ];
    await Promise.all(docs.map(([path, value]) => setDoc(doc(db, path), value)));
  });
});

after(async () => { await testEnv?.cleanup(); });

function context(uid, role, organizationId, siteIds = []) {
  return testEnv.authenticatedContext(uid, { role, organizationId, siteIds, departmentIds: [] }).firestore();
}

test('workers read only their own attendance and payslips', async () => {
  const db = context('worker-a', 'worker', 'org-a', ['site-a']);
  await assertSucceeds(getDoc(doc(db, 'organizations/org-a/attendance/att-a')));
  await assertFails(getDoc(doc(db, 'organizations/org-a/attendance/att-b')));
  await assertSucceeds(getDoc(doc(db, 'organizations/org-a/payrollRecords/pay-a')));
  await assertFails(getDoc(doc(db, 'organizations/org-a/payrollRecords/pay-b')));
});

test('organization and site claims prevent cross-tenant and cross-site reads', async () => {
  const worker = context('worker-a', 'worker', 'org-a', ['site-a']);
  const supervisor = context('lead-a', 'supervisor', 'org-a', ['site-a']);
  await assertSucceeds(getDoc(doc(worker, 'organizations/org-a/sites/site-a')));
  await assertFails(getDoc(doc(worker, 'organizations/org-a/sites/site-b')));
  await assertFails(getDoc(doc(worker, 'organizations/org-b/sites/campus-a')));
  await assertSucceeds(getDoc(doc(supervisor, 'organizations/org-a/attendance/att-a')));
  await assertFails(getDoc(doc(supervisor, 'organizations/org-a/attendance/att-b')));
  await assertFails(getDoc(doc(supervisor, 'organizations/org-b/sites/campus-a')));
});

test('workers cannot grant themselves roles or write attendance or payroll', async () => {
  const db = context('worker-a', 'worker', 'org-a', ['site-a']);
  await assertFails(updateDoc(doc(db, 'users/worker-a'), { role: 'admin' }));
  await assertFails(setDoc(doc(db, 'organizations/org-a/attendance/forged'), {
    organizationId: 'org-a', workerUid: 'worker-a', siteId: 'site-a', status: 'checked_in'
  }));
  await assertFails(setDoc(doc(db, 'organizations/org-a/payrollRecords/forged'), {
    organizationId: 'org-a', workerUid: 'worker-a', netAmount: 999999
  }));
});

test('admins manage their organization while still blocked from other tenants', async () => {
  const db = context('admin-a', 'admin', 'org-a');
  await assertSucceeds(getDoc(doc(db, 'organizations/org-a')));
  await assertFails(getDoc(doc(db, 'organizations/org-b')));
  await assertSucceeds(setDoc(doc(db, 'organizations/org-a/sites/site-c'), {
    organizationId: 'org-a', name: 'New site', industry: 'construction', createdAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(db, 'organizations/org-b/sites/campus-a')));
});

test('site queries must stay within a worker assigned scope', async () => {
  const db = context('worker-a', 'worker', 'org-a', ['site-a']);
  const sites = query(collection(db, 'organizations/org-a/sites'), where(documentId(), 'in', ['site-a']));
  await assertSucceeds(getDocs(sites));
  await assertFails(getDocs(collection(db, 'organizations/org-a/sites')));
});

test('workers can submit a safety report only for an assigned site and cannot change its status directly', async () => {
  const db = context('worker-a', 'worker', 'org-a', ['site-a']);
  const created = await assertSucceeds(addDoc(collection(db, 'organizations/org-a/safetyReports'), {
    organizationId: 'org-a', reporterUid: 'worker-a', title: 'Loose handrail', description: 'The handrail is moving.',
    category: 'hazard', severity: 'medium', siteId: 'site-a', status: 'open',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(addDoc(collection(db, 'organizations/org-a/safetyReports'), {
    organizationId: 'org-a', reporterUid: 'worker-a', title: 'Other site issue', description: 'Outside assignment.',
    category: 'hazard', severity: 'low', siteId: 'site-b', status: 'open',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'organizations/org-a/safetyReports', created.id), { status: 'resolved' }));
});
