// Run only from a trusted administrator workstation with Application Default Credentials.
// Never expose service-account credentials in the browser or repository.
const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.FIREBASE_PROJECT_ID;
const uid = process.env.WORKZENITH_ADMIN_UID;
const organizationId = process.env.WORKZENITH_ORGANIZATION_ID;
if (!projectId || !uid || !organizationId) {
  throw new Error('Set FIREBASE_PROJECT_ID, WORKZENITH_ADMIN_UID, and WORKZENITH_ORGANIZATION_ID in your trusted shell.');
}
initializeApp({ credential: applicationDefault(), projectId });

async function main() {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const organization = await getFirestore().collection('organizations').doc(organizationId).get();
  if (!organization.exists) throw new Error(`Organization ${organizationId} does not exist.`);
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}), role: 'admin', organizationId,
    siteIds: [], departmentIds: []
  });
  await getFirestore().collection('users').doc(uid).set({
    uid, displayName: user.displayName || '', role: 'admin', organizationId,
    siteIds: [], departmentIds: [], status: 'active', updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await getFirestore().collection('organizations').doc(organizationId).collection('auditLogs').add({
    actorUid: 'trusted-bootstrap', action: 'admin.roleGranted', targetUid: uid,
    createdAt: FieldValue.serverTimestamp()
  });
  console.log(`Administrator role assigned to UID ${uid} in organization ${organizationId}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
