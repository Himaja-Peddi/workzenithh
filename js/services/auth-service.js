let firebaseRuntime;

async function getRuntime() {
  if (!firebaseRuntime) {
    firebaseRuntime = (async () => {
      const [{ initializeWorkZenithFirebase }, authSdk] = await Promise.all([
        import('../firebase.js'),
        import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js')
      ]);
      return { ...await initializeWorkZenithFirebase(), authSdk };
    })().catch((error) => {
      firebaseRuntime = undefined;
      throw error;
    });
  }
  return firebaseRuntime;
}

function mapIdentity(user, token) {
  const claims = token.claims;
  const role = claims.role;
  const organizationId = claims.organizationId;
  if (!['worker', 'supervisor', 'admin'].includes(role) || typeof organizationId !== 'string' || !organizationId) {
    return { user, pendingProvisioning: true };
  }
  return {
    user, uid: user.uid, email: user.email, role, organizationId,
    siteIds: Array.isArray(claims.siteIds) ? claims.siteIds : [],
    departmentIds: Array.isArray(claims.departmentIds) ? claims.departmentIds : [],
    mode: 'cloud', pendingProvisioning: false
  };
}

export async function signInWithPassword(email, password) {
  const { auth, authSdk } = await getRuntime();
  const credential = await authSdk.signInWithEmailAndPassword(auth, email.trim(), password);
  const token = await authSdk.getIdTokenResult(credential.user, true);
  return { runtime: await getRuntime(), identity: mapIdentity(credential.user, token) };
}

export async function createAccount(email, password) {
  const { auth, authSdk } = await getRuntime();
  const credential = await authSdk.createUserWithEmailAndPassword(auth, email.trim(), password);
  const token = await authSdk.getIdTokenResult(credential.user, true);
  return { runtime: await getRuntime(), identity: mapIdentity(credential.user, token) };
}

export async function sendPasswordRecovery(email) {
  const { auth, authSdk } = await getRuntime();
  return authSdk.sendPasswordResetEmail(auth, email.trim());
}

export async function signOutCloud() {
  const { auth, authSdk } = await getRuntime();
  await authSdk.signOut(auth);
}

export async function getExistingCloudSession() {
  const { auth, authSdk } = await getRuntime();
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return { runtime: await getRuntime(), identity: null };
  const token = await authSdk.getIdTokenResult(user, true);
  return { runtime: await getRuntime(), identity: mapIdentity(user, token) };
}
