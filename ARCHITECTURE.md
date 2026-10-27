# WorkZenith architecture

## Current milestone

Static HTML/CSS and native JavaScript ES modules, no framework or bundler. `js/app.js` routes between an authenticated cloud view and a separate, explicit demo view; `js/permissions.js` centralizes UI capability checks. `js/services/` contains Firebase Auth and organization data calls. `js/firebase.js` centralizes modular SDK initialization for project `workzenith-8cc11`. Demo fixtures are separate from cloud services, and failed cloud reads never use demo records. The Firebase JS SDK is pinned to 13.1.0 browser modules; Cloud Functions use Node.js 22 with the modular Admin SDK.

## Planned data model

Use Authentication UID as `users/{uid}` identity. Organization-owned records carry `organizationId`; site-scoped records also carry `siteId`, and where relevant `departmentId`.

| Collection | Intended scope and key relationship |
|---|---|
| `organizations/{orgId}` | Industry (`construction`, `hospital`, `education`, `factory`), name and organization metadata |
| `users/{uid}` | Firebase UID, role, organization ID, assigned site/department IDs, display name and preferences; private email stays in Auth |
| `organizations/{orgId}/sites/{siteId}` / `departments/{departmentId}` | Tenant-scoped work sites and departments |
| `organizations/{orgId}/shifts/{shiftId}` | Organization/site/department, assigned UIDs, date, start/end and state |
| `organizations/{orgId}/attendance/{shiftId_uid}` | Worker UID, shift/site, server timestamps, state and recorded minutes; clients cannot write |
| `payrollRecords/{recordId}` | Worker UID and period, itemized verified amounts; worker and authorized payroll roles only |
| `organizations/{orgId}/safetyReports/{reportId}` / `grievances/{grievanceId}` | Reporter, site, severity and status history; sensitive reads are role-limited |
| `organizations/{orgId}/anonymousFeedback/{feedbackId}` | Payload without reporter UID; direct reads denied pending a safe aggregation function |
| `skillPassports/{uid}` / `trainingRecords/{recordId}` | Self-reported vs verified skill state and evidence metadata |
| `fatigueAlerts/{alertId}` | Rule, relevant shift references, state and review; risk indicator, not diagnosis |
| `notifications/{notificationId}` / `auditLogs/{logId}` | Recipient notices and append-only trusted audit events |

Application queries are bounded to 100 records and scoped by organization, role, site, or worker UID. Worker site/department queries are restricted to custom-claim assignments. Define retention and deletion policy before production data collection.

## Roles and boundaries

Worker: own attendance/payslips and personal records, assigned shifts, and eligible submissions. Supervisor: assigned site team attendance and safety incidents; report updates are checked by the callable function against claim site IDs. Admin: their claimed organization configuration and operational records; can provision workers/supervisors but cannot assign admin claims through the UI/callable. Salary reads are worker-own/admin only; grievance reads are reporter/admin only. App capability checks are convenience only. Firestore Rules enforce tenant/site/owner boundaries, while attendance timestamps, status transitions, audit entries, and role claims use trusted functions/Admin SDK.

## Trusted operations

Implemented Cloud Functions: `provisionOrganizationMember` assigns only worker/supervisor claims within the caller's organization; `recordAttendance` validates shift and site assignment, prevents duplicate check-in/out, writes server timestamps and recorded minutes; `transitionSafetyReport` limits site reviews, validates state transitions, and writes audit history. `functions/scripts/bootstrap-admin.js` is the trusted path for the first administrator and later admin grants. The caller must use Application Default Credentials on a trusted machine. Never ship service-account keys to the browser. QR/location verification, overtime approval, payroll publishing, anonymous-feedback aggregation and fatigue processing are not implemented. Static QR and client-side location are not proof of presence.

For the first tenant, a trusted project operator creates the organization, site, and department documents in Firestore Console or with a private Admin SDK utility, then creates the administrator's Authentication account and runs the bootstrap script. Organization documents have `name`, `industry`, and `organizationId`; site documents have `organizationId`, `name`, `industry`, and server `createdAt`; department documents have `organizationId`, `siteId`, `name`, and server `createdAt`. The first administrator's custom claims are `{ role: 'admin', organizationId, siteIds: [], departmentIds: [] }`. Firebase Auth custom claims are the role source of truth; the matching `users/{uid}` profile is written by trusted Admin SDK code. A newly registered account without claims stays in the onboarding gate.

Cloud Functions use Node.js 22. Admin role grants always require a trusted operator; organization admins can provision only workers and supervisors through the callable endpoint.

## Industry configuration

Industry is an organization field, not a separate application. Seeded demo organizations are Northline Build Co. (construction; Riverside and Hillview sites) and Lakemont College (education; Central and North campuses with housekeeping, maintenance and campus support). Both use the same site, department, shift, attendance, report and dashboard components. Hospital and factory remain supported industry values for tenant configuration; their detailed seed fixtures/workflow policies remain to be added.
