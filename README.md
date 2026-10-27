# WorkZenith

WorkZenith is a worker-first workforce-management platform for construction, hospitals, education and factories. This milestone adds Firebase email/password authentication, role-gated worker/supervisor/employer workspaces, organization-scoped Firestore services and rules, trusted Cloud Functions, and a separate demo mode. The demo seed includes a construction company with two sites and a college with two campuses and housekeeping, maintenance, and campus-support departments. Demo state is temporary and never presented as cloud data.

## Run the preview

Open this folder in VS Code and choose **Open with Live Server** on `index.html`. ES modules generally do not work from a `file://` URL. The demo works without Firebase credentials or a build step. Firebase SDK modules load from Google's CDN only after a user chooses a cloud-auth action. The page uses a Google Fonts stylesheet with system-font fallback.

## Firebase setup

1. The registered Firebase Web app configuration for project `workzenith-8cc11` is set in `js/firebase.js`. If using another project, replace those values from Firebase Console → Project settings → Your apps.
2. In Firebase Console, enable Authentication → Email/Password and create the Firestore database. The web config identifies the project; Rules and trusted functions enforce authorization.
3. Create an organization document at `organizations/{organizationId}` with a name and industry (`construction`, `hospital`, `education`, or `factory`). Create its initial `sites/{siteId}` and `departments/{departmentId}` documents with the fields shown in [ARCHITECTURE.md](ARCHITECTURE.md). Use the Firebase Console or a trusted Admin SDK environment for initial tenant provisioning.
4. Create the administrator's Firebase Authentication account. From a trusted workstation with Node.js 22 and Application Default Credentials for the project, run the admin bootstrap script. It assigns the custom claim and profile; browser clients cannot grant admin roles:

   ```powershell
   cd functions
   npm install
   $env:FIREBASE_PROJECT_ID = 'workzenith-8cc11'
   $env:WORKZENITH_ADMIN_UID = 'AUTH_UID_FROM_FIREBASE_AUTH'
   $env:WORKZENITH_ORGANIZATION_ID = 'YOUR_ORGANIZATION_ID'
   npm run bootstrap-admin
   ```

5. Copy `.firebaserc.example` to `.firebaserc` and set the project ID. `.firebaserc` is ignored by Git. Install the Firebase CLI and root test dependencies:

   ```powershell
   npm install -g firebase-tools
   npm install
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

6. After deploying rules and functions, an organization admin can provision existing Authentication users as workers or supervisors, assign their sites/departments, edit their organization profile, add sites/departments, and create or cancel shifts. Admin role grants require the trusted bootstrap process.

Firebase web config does not protect data. Security Rules, Authentication, trusted Cloud Functions, and appropriately scoped queries must enforce access.

## Configuration safety

Do not commit `.env`, `.firebaserc`, service-account files, or private credentials. Firebase Web configuration in `js/firebase.js` is public project configuration, not a security boundary. Demo is explicitly separate from Firebase. If cloud authentication or a Firestore request fails, the app shows an error and never falls back to sample records.

## Current status

Role workspace functionality in this milestone includes Firebase sign-in, sign-up with pending role provisioning, password recovery, session resume/sign-out, personal or assigned shifts, worker check-in/out through a server function, site-scoped supervisor attendance/report review, employer site/department/shift management, worker/supervisor provisioning, and a bounded organization overview. Demo mode exercises worker check-in/out, safety submission/review, organization configuration, and shared shift/attendance/report components without a cloud account. Payslips, grievances, anonymous feedback, skills, fatigue processing, and fuller analytics are still pending.

For local rule tests, run `npm run test:emulator` after installing dependencies and the Firebase CLI. Deployment and live Firebase integration require project services, Firebase CLI, trusted admin setup, and Cloud Functions deployment. Never run the bootstrap script in an untrusted shell.

See [ARCHITECTURE.md](ARCHITECTURE.md) for planned schema and trusted operations, and [TESTING.md](TESTING.md) for verification status and the next test gates.
