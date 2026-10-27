import { DEMO_ORGANIZATIONS } from './demo-fixtures.js';
import { canReadSite, hasCapability } from './permissions.js';
import { translations } from './translations.js';
import { createOrganizationRecord, createSafetyReport, loadOrganizationWorkspace, provisionMember, recordCloudAttendance, transitionCloudSafetyReport, updateOrganization, updateOrganizationRecord, updateShiftStatus } from './services/organization-service.js';

const $ = (selector) => document.querySelector(selector);
const language = $('#language');
const state = { identity: null, runtime: null, workspace: null, demoKey: null, activeSiteId: 'all', busy: false };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function slug(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }
function announce(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  window.clearTimeout(announce.timer);
  announce.timer = window.setTimeout(() => { toast.hidden = true; }, 4200);
}
function setAuthMessage(message, isError = false) {
  const node = $('#auth-message');
  node.textContent = message;
  node.classList.toggle('error-text', isError);
}
function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('#cloud-login button, #resume-session, #create-account, #recover-password').forEach((button) => { button.disabled = value; });
}
function firebaseError(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password was not accepted.',
    'auth/user-not-found': 'No account was found for that email.',
    'auth/wrong-password': 'The email or password was not accepted.',
    'auth/too-many-requests': 'Too many attempts. Wait a while, then try again.',
    'auth/network-request-failed': 'Firebase could not be reached. Check your connection and try again.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/weak-password': 'Choose a password with at least six characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'permission-denied': 'Your account cannot read this organization data. Contact your administrator.'
  };
  return messages[error?.code] || error?.message || 'The request failed. Please try again.';
}
function setLanguage(code) {
  document.documentElement.lang = code;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const translated = translations[code]?.[node.dataset.i18n];
    if (translated) node.textContent = translated;
  });
  language.value = code;
}
function tr(key, fallback) { return translations[language.value]?.[key] || fallback; }
function roleTitle(role) { return tr(`workspace.${role}`, ({ worker: 'Worker workspace', supervisor: 'Supervisor workspace', admin: 'Employer workspace' })[role] || 'WorkZenith'); }
function roleName(role) { return tr(`role.${role}`, ({ worker: 'Worker', supervisor: 'Supervisor', admin: 'Administrator' })[role] || role); }
function displayName() { return state.identity?.displayName || state.identity?.user?.displayName || state.identity?.email || (state.identity?.role === 'worker' ? 'Arun Kumar' : roleName(state.identity?.role)); }

function cloneDemoOrganization(key) {
  return JSON.parse(JSON.stringify(DEMO_ORGANIZATIONS[key]));
}
function enterDemo(role) {
  const key = $('#demo-organization').value;
  const workspace = cloneDemoOrganization(key);
  const member = workspace.members.find((person) => person.role === role) || workspace.members[0];
  const siteIds = role === 'admin' ? workspace.sites.map((site) => site.id) : member.siteIds;
  state.identity = {
    uid: member.uid, displayName: role === 'admin' ? 'Demo administrator' : role === 'supervisor' ? member.displayName : member.displayName,
    role, organizationId: workspace.id, siteIds, departmentIds: [member.departmentId],
    mode: 'demo', industry: workspace.industry
  };
  state.runtime = null;
  state.workspace = workspace;
  state.demoKey = key;
  state.activeSiteId = 'all';
  showWorkspace(true);
  renderWorkspace();
}
function showWorkspace(demo) {
  $('#auth-gate').hidden = true;
  $('#application').hidden = false;
  $('#sign-out').hidden = false;
  $('#identity-chip').hidden = false;
  $('#identity-chip').textContent = `${displayName()} · ${roleName(state.identity.role)}`;
  $('#workspace-banner').className = `demo-notice${demo ? '' : ' cloud-notice'}`;
  $('#workspace-banner').textContent = demo
    ? tr('demo.banner', 'DEMO DATA · This temporary preview is separate from Firebase. Changes are held in this page only and do not secure or alter any cloud records.')
    : `${tr('cloud.banner', 'SIGNED IN · Organization records are loaded from Firebase and limited to')} ${state.identity.organizationId}. ${tr('cloud.noDemo', 'Demo data is not used in this session.')}`;
}
function enterCloud(identity, runtime) {
  if (identity.pendingProvisioning) {
    state.identity = { user: identity.user, mode: 'cloud-pending' };
    state.runtime = runtime;
    $('#sign-out').hidden = false;
    $('#identity-chip').hidden = false;
    $('#identity-chip').textContent = 'Account pending organization access';
    setAuthMessage(`Your Firebase account is signed in, but an administrator must assign your organization and role before you can access records. Share this UID with your organization administrator: ${identity.user.uid}`);
    return;
  }
  state.identity = { ...identity, displayName: identity.user.displayName || identity.user.email };
  state.runtime = runtime;
  state.demoKey = null;
  state.activeSiteId = 'all';
  showWorkspace(false);
  loadCloudWorkspace();
}
async function loadCloudWorkspace() {
  $('#workspace-title').textContent = tr('common.loading', 'Loading organization data…');
  $('#stats').innerHTML = `<p class="muted" role="status">${escapeHtml(tr('common.loading', 'Loading organization data…'))}</p>`;
  $('#shift-rows').replaceChildren();
  $('#report-list').replaceChildren();
  try {
    state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    renderWorkspace();
  } catch (error) {
    state.workspace = null;
    renderWorkspaceError(firebaseError(error));
  }
}
function renderWorkspaceError(message) {
  $('#workspace-title').textContent = 'Organization data unavailable';
  $('#workspace-subtitle').textContent = message;
  $('#stats').replaceChildren();
  $('#shift-rows').replaceChildren();
  $('#shift-empty').hidden = false;
  $('#shift-empty').textContent = 'No sample data is displayed when a Firebase request fails.';
  $('#report-list').replaceChildren();
  $('#report-empty').hidden = false;
  $('#report-empty').textContent = 'Connect to the organization data service to see reports.';
  $('#organization-panel').hidden = true;
  announce(message, true);
}

function scopedSites() {
  return (state.workspace?.sites || []).filter((site) => canReadSite(state.identity, site.id));
}
function selectedSiteIds() {
  if (!state.activeSiteId) return [];
  return state.activeSiteId === 'all' ? scopedSites().map((site) => site.id) : [state.activeSiteId];
}
function visibleShifts() {
  const siteIds = selectedSiteIds();
  return (state.workspace?.shifts || []).filter((shift) => siteIds.includes(shift.siteId) &&
    (state.identity.role !== 'worker' || shift.workerUids?.includes(state.identity.uid)));
}
function visibleAttendance() {
  const siteIds = selectedSiteIds();
  return (state.workspace?.attendance || []).filter((record) => siteIds.includes(record.siteId) &&
    (state.identity.role !== 'worker' || record.workerUid === state.identity.uid));
}
function visibleReports() {
  const siteIds = selectedSiteIds();
  return (state.workspace?.safetyReports || []).filter((report) => siteIds.includes(report.siteId) &&
    (state.identity.role !== 'worker' || report.reporterUid === state.identity.uid));
}
function recordTime(value) {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return 'Recorded';
}
function siteName(id) { return state.workspace?.sites?.find((site) => site.id === id)?.name || id || '—'; }
function departmentName(id) { return state.workspace?.departments?.find((department) => department.id === id)?.name || id || '—'; }
function memberName(uid) { return state.workspace?.members?.find((member) => member.uid === uid || member.id === uid)?.displayName || 'Assigned worker'; }
function attendanceFor(shift) { return visibleAttendance().find((record) => record.shiftId === shift.id); }

function renderWorkspace() {
  if (!state.workspace) return;
  const organization = state.workspace.organization || state.workspace;
  const { sites, departments } = state.workspace;
  const sitesAllowed = scopedSites();
  if (state.activeSiteId !== 'all' && !sitesAllowed.some((site) => site.id === state.activeSiteId)) state.activeSiteId = 'all';
  $('#role-label').textContent = `${roleName(state.identity.role).toUpperCase()} · ${(organization.industry || state.identity.industry || 'workforce').toUpperCase()}`;
  $('#workspace-title').textContent = roleTitle(state.identity.role);
  const siteCountLabel = sitesAllowed.length === 1 ? tr('org.oneSite', 'assigned site') : tr('org.manySites', 'assigned sites');
  $('#workspace-subtitle').textContent = `${organization.name || tr('org.organization', 'Organization')} · ${sitesAllowed.length} ${siteCountLabel}`;
  renderSiteFilters(sitesAllowed);
  $('#shift-scope').textContent = `${visibleShifts().length} ${tr('shift.inScope', 'shifts in scope')}`;
  renderStats();
  renderShiftRows();
  renderReports();
  renderAdminConfiguration();
  $('#shift-empty').hidden = visibleShifts().length > 0;
  $('#report-empty').hidden = visibleReports().length > 0;
  $('#report-count').textContent = `${visibleReports().length} ${tr('common.inScope', 'in scope')}`;
  $('#report-form').hidden = !hasCapability(state.identity, 'report:create');
  $('#report-site').innerHTML = sitesAllowed.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join('');
}
function renderSiteFilters(sites) {
  const filter = $('#site-filter');
  const canSelectAll = state.identity.role === 'admin' || state.identity.role === 'supervisor';
  if (!canSelectAll && !sites.some((site) => site.id === state.activeSiteId)) state.activeSiteId = sites[0]?.id || '';
  const options = canSelectAll
    ? `<option value="all">${escapeHtml(tr('org.allSites', 'All assigned sites'))}</option>${sites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join('')}`
    : sites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join('');
  filter.innerHTML = options || '<option value="">No sites assigned</option>';
  filter.value = state.activeSiteId || '';
}
function renderStats() {
  const shifts = visibleShifts();
  const attendance = visibleAttendance();
  const reports = visibleReports();
  const assigned = new Set(shifts.flatMap((shift) => shift.workerUids || []));
  const checkedIn = attendance.filter((item) => item.status === 'checked_in').length;
  const openReports = reports.filter((report) => !['resolved', 'closed'].includes(report.status)).length;
  const items = state.identity.role === 'worker'
    ? [
      [tr('stats.myShifts', 'My shifts'), String(shifts.length), tr('stats.assignedYou', 'Assigned to you')],
      [tr('stats.checkedIn', 'Checked in'), String(checkedIn), tr('stats.yourAttendance', 'Your current shift record')],
      [tr('stats.hours', 'Recorded hours'), recordedHours(attendance), tr('stats.hoursFoot', 'Recorded time; payroll may differ')],
      [tr('stats.openReports', 'My open reports'), String(openReports), tr('stats.mine', 'Submitted by your account')]
    ]
    : [
      [tr('stats.scheduledWorkers', 'Workers on schedule'), String(assigned.size), tr('stats.uniqueWorkers', 'Unique assigned workers')],
      [tr('stats.checkedIn', 'Checked in'), String(checkedIn), tr('stats.fromRecords', 'From recorded attendance')],
      [tr('stats.openSafety', 'Open safety reports'), String(openReports), tr('stats.authorizedScope', 'Within your authorized scope')],
      [tr('stats.sites', 'Sites in scope'), String(selectedSiteIds().length), state.identity.role === 'admin' ? tr('stats.orgLocations', 'Organization locations') : tr('stats.assignedLocations', 'Assigned locations')]
    ];
  $('#stats').innerHTML = items.map(([label, value, foot]) => `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(foot)}</small></article>`).join('');
}
function recordedHours(records) {
  const minutes = records.reduce((total, item) => total + (Number(item.recordedMinutes) || 0), 0);
  return `${(minutes / 60).toFixed(1)} h`;
}
function renderShiftRows() {
  const body = $('#shift-rows');
  const shifts = visibleShifts();
  body.innerHTML = shifts.map((shift) => {
    const record = attendanceFor(shift);
    const attendanceStatus = shift.status === 'cancelled' ? tr('shift.cancelled', 'Cancelled') : record?.status === 'checked_in' ? `${tr('shift.checkedIn', 'Checked in')} · ${recordTime(record.checkInAt)}` : record?.status === 'checked_out' ? tr('shift.checkedOut', 'Checked out') : tr('shift.notChecked', 'Not checked in');
    const assigned = state.identity.role === 'worker' ? '' : `<small>${(shift.workerUids || []).map(memberName).map(escapeHtml).join(', ') || 'No worker assigned'}</small>`;
    let action = `<span class="small muted">${escapeHtml(tr('common.readOnly', 'Read only'))}</span>`;
    if (state.identity.role === 'worker') {
      const next = record?.status === 'checked_in' ? 'checkOut' : 'checkIn';
      const label = next === 'checkOut' ? tr('shift.checkOut', 'Check out') : tr('shift.checkIn', 'Check in');
      action = shift.status === 'cancelled' ? `<span class="small muted">${escapeHtml(tr('shift.cancelled', 'Cancelled'))}</span>` : `<button type="button" class="button button-primary small-button" data-attendance-action="${next}" data-shift-id="${escapeHtml(shift.id)}">${escapeHtml(label)}</button>`;
    } else if (state.identity.role === 'admin') {
      const nextStatus = shift.status === 'cancelled' ? 'scheduled' : 'cancelled';
      action = `<button type="button" class="button button-outline small-button" data-shift-status="${escapeHtml(shift.id)}" data-next-status="${nextStatus}">${escapeHtml(nextStatus === 'cancelled' ? tr('shift.cancel', 'Cancel') : tr('shift.restore', 'Restore'))}</button>`;
    }
    return `<tr><td><strong>${escapeHtml(shift.title)}</strong>${assigned}</td><td>${escapeHtml(siteName(shift.siteId))}<small>${escapeHtml(departmentName(shift.departmentId))}</small></td><td>${escapeHtml(shift.date || '—')}<small>${escapeHtml(shift.startTime || '—')}–${escapeHtml(shift.endTime || '—')}</small></td><td>${escapeHtml(attendanceStatus)}</td><td>${action}</td></tr>`;
  }).join('');
  $('#shift-empty').hidden = shifts.length > 0;
}
function renderReports() {
  const list = $('#report-list');
  const reports = visibleReports();
  list.innerHTML = reports.map((report) => {
    const nextStatuses = ({ open: ['acknowledged', 'escalated'], acknowledged: ['in_progress', 'escalated', 'resolved'], in_progress: ['escalated', 'resolved'], escalated: ['in_progress', 'resolved'] })[report.status] || [];
    const reviewControl = hasCapability(state.identity, 'report:review') && nextStatuses.length
      ? `<label class="sr-only" for="status-${escapeHtml(report.id)}">${escapeHtml(tr('report.updateStatus', 'Update report status'))}</label><select id="status-${escapeHtml(report.id)}" data-report-status required><option value="" selected disabled>${escapeHtml(tr('report.chooseStatus', 'Choose a status'))}</option>${nextStatuses.map((status) => `<option value="${status}">${escapeHtml(tr(`report.${status}`, status.replaceAll('_', ' ')))}</option>`).join('')}</select><button class="button button-outline small-button" type="button" data-report-update="${escapeHtml(report.id)}">${escapeHtml(tr('common.update', 'Update'))}</button>`
      : hasCapability(state.identity, 'report:review') ? `<span class="small muted">${escapeHtml(tr('report.noFurtherUpdate', 'No further status updates'))}</span>` : '';
    const reporter = state.identity.role === 'worker' ? '' : `<small>Submitted by ${escapeHtml(memberName(report.reporterUid))}</small>`;
    const statusKey = `report.${report.status || 'open'}`;
    const category = tr(`report.${report.category}`, report.category || 'report');
    const severity = tr(`severity.${report.severity}`, report.severity || '—');
    return `<li class="report-item"><div class="report-heading"><div><strong>${escapeHtml(report.title)}</strong>${reporter}<small>${escapeHtml(siteName(report.siteId))} · ${escapeHtml(category)} · ${escapeHtml(severity)}</small></div><span class="status-pill status-${escapeHtml(report.status)}">${escapeHtml(tr(statusKey, (report.status || 'open').replaceAll('_', ' ')))}</span></div><div class="report-actions">${reviewControl}</div></li>`;
  }).join('');
  $('#report-empty').hidden = reports.length > 0;
}
function renderAdminConfiguration() {
  const visible = state.identity.role === 'admin';
  $('#organization-panel').hidden = !visible;
  if (!visible) return;
  const workspace = state.workspace;
  $('#organization-form [name="name"]').value = workspace.organization?.name || workspace.name || '';
  $('#organization-form [name="industry"]').value = workspace.organization?.industry || workspace.industry || 'construction';
  $('#site-list').innerHTML = workspace.sites.map((site) => `<li><form class="rename-form" data-rename-site="${escapeHtml(site.id)}"><label class="sr-only" for="rename-site-${escapeHtml(site.id)}">Rename ${escapeHtml(site.name)}</label><input id="rename-site-${escapeHtml(site.id)}" name="name" value="${escapeHtml(site.name)}" required maxlength="120" /><button class="button button-outline small-button" type="submit">${escapeHtml(tr('common.save', 'Save'))}</button></form><small>${escapeHtml(site.addressLabel || 'Organization site')}</small></li>`).join('');
  $('#department-list').innerHTML = workspace.departments.map((department) => `<li><form class="rename-form" data-rename-department="${escapeHtml(department.id)}"><label class="sr-only" for="rename-department-${escapeHtml(department.id)}">Rename ${escapeHtml(department.name)}</label><input id="rename-department-${escapeHtml(department.id)}" name="name" value="${escapeHtml(department.name)}" required maxlength="100" /><button class="button button-outline small-button" type="submit">${escapeHtml(tr('common.save', 'Save'))}</button></form><small>${escapeHtml(siteName(department.siteId))}</small></li>`).join('');
  const siteOptions = workspace.sites.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join('');
  $('#department-site').innerHTML = siteOptions;
  $('#shift-site').innerHTML = siteOptions;
  $('#member-sites').innerHTML = siteOptions;
  $('#shift-department').innerHTML = workspace.departments.map((department) => `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join('');
  $('#member-departments').innerHTML = workspace.departments.map((department) => `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join('');
  $('#shift-workers').innerHTML = workspace.members.filter((member) => member.role === 'worker').map((member) => `<option value="${escapeHtml(member.uid || member.id)}">${escapeHtml(member.displayName || 'Worker')}</option>`).join('');
}
function getSelectedValues(select) { return [...select.selectedOptions].map((option) => option.value); }
function refreshCloudOrRender() { return state.identity.mode === 'demo' ? renderWorkspace() : loadCloudWorkspace(); }

async function handleCloudAuth(operation) {
  if (state.busy) return;
  setBusy(true);
  try {
    const authModule = await import('./services/auth-service.js');
    let result;
    if (operation === 'signIn') result = await authModule.signInWithPassword($('#email').value, $('#password').value);
    else if (operation === 'create') result = await authModule.createAccount($('#email').value, $('#password').value);
    else result = await authModule.getExistingCloudSession();
    if (!result.identity) {
      setAuthMessage('No existing Firebase session was found. Enter your organization account above.');
      return;
    }
    setAuthMessage('');
    enterCloud(result.identity, result.runtime);
    if (operation === 'create' && result.identity.pendingProvisioning) {
      setAuthMessage(`Account created. An administrator must assign your organization and role. Account UID: ${result.identity.user.uid}`);
    }
  } catch (error) {
    setAuthMessage(firebaseError(error), true);
  } finally {
    setBusy(false);
  }
}

$('#cloud-login').addEventListener('submit', (event) => {
  event.preventDefault();
  if ($('#cloud-login').reportValidity()) handleCloudAuth('signIn');
});
$('#create-account').addEventListener('click', () => {
  if ($('#email').value.trim() && $('#password').value.length >= 6) handleCloudAuth('create');
  else setAuthMessage('Enter a valid email and a password with at least six characters before creating an account.', true);
});
$('#recover-password').addEventListener('click', async () => {
  if (!$('#email').value.trim()) return setAuthMessage('Enter your email address first so Firebase can send the recovery link.', true);
  setBusy(true);
  try {
    const { sendPasswordRecovery } = await import('./services/auth-service.js');
    await sendPasswordRecovery($('#email').value);
    setAuthMessage('If the account exists, Firebase has sent a password recovery email.');
  } catch (error) { setAuthMessage(firebaseError(error), true); }
  finally { setBusy(false); }
});
$('#resume-session').addEventListener('click', () => handleCloudAuth('resume'));
document.querySelectorAll('[data-demo-role]').forEach((button) => button.addEventListener('click', () => enterDemo(button.dataset.demoRole)));
language.addEventListener('change', () => { setLanguage(language.value); try { localStorage.setItem('workzenith.language', language.value); } catch {} if (state.workspace) renderWorkspace(); });
$('#large-text').addEventListener('click', (event) => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  document.body.classList.toggle('large-text', enabled);
  try { localStorage.setItem('workzenith.largeText', String(enabled)); } catch {}
});
$('#contrast').addEventListener('click', (event) => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  document.body.classList.toggle('high-contrast', enabled);
  try { localStorage.setItem('workzenith.highContrast', String(enabled)); } catch {}
});

$('#sign-out').addEventListener('click', async () => {
  if (state.identity?.mode === 'cloud' || state.identity?.mode === 'cloud-pending') {
    try {
      const { signOutCloud } = await import('./services/auth-service.js');
      await signOutCloud();
    } catch (error) { announce(firebaseError(error), true); return; }
  }
  state.identity = null; state.workspace = null; state.runtime = null; state.demoKey = null;
  $('#application').hidden = true; $('#auth-gate').hidden = false; $('#sign-out').hidden = true; $('#identity-chip').hidden = true;
  $('#identity-chip').textContent = '';
  setAuthMessage('');
});

$('#site-filter').addEventListener('change', () => { state.activeSiteId = $('#site-filter').value; renderWorkspace(); });
$('#shift-rows').addEventListener('click', async (event) => {
  const statusButton = event.target.closest('[data-shift-status]');
  if (statusButton) {
    const shift = state.workspace.shifts.find((item) => item.id === statusButton.dataset.shiftStatus);
    try {
      await updateShiftStatus(state.runtime, state.identity, shift, statusButton.dataset.nextStatus);
      if (state.identity.mode !== 'demo') state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
      renderWorkspace(); announce(`Shift ${statusButton.dataset.nextStatus === 'cancelled' ? 'cancelled' : 'restored'}.`);
    } catch (error) { announce(firebaseError(error), true); }
    return;
  }
  const button = event.target.closest('[data-attendance-action]');
  if (!button) return;
  const action = button.dataset.attendanceAction;
  button.disabled = true;
  try {
    if (state.identity.mode === 'demo') {
      const shift = state.workspace.shifts.find((item) => item.id === button.dataset.shiftId);
      let record = state.workspace.attendance.find((item) => item.shiftId === shift.id && item.workerUid === state.identity.uid);
      if (action === 'checkIn' && !record) {
        const checkedInAt = Date.now();
        record = { id: `demo-${checkedInAt}`, workerUid: state.identity.uid, shiftId: shift.id, siteId: shift.siteId, checkInAt: new Date(checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), checkInEpoch: checkedInAt, checkOutAt: null, status: 'checked_in', recordedMinutes: 0 };
        state.workspace.attendance.push(record);
      } else if (action === 'checkOut' && record?.status === 'checked_in') {
        record.checkOutAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        record.status = 'checked_out';
        record.recordedMinutes = Math.max(0, Math.floor((Date.now() - (record.checkInEpoch || Date.now())) / 60000));
        delete record.checkInEpoch;
      }
    } else {
      await recordCloudAttendance(state.runtime, state.identity, button.dataset.shiftId, action);
      await loadCloudWorkspace();
    }
    renderWorkspace();
  } catch (error) { announce(firebaseError(error), true); button.disabled = false; }
});

$('#organization-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name')).trim(); const industry = String(form.get('industry'));
  if (!name) return announce('Enter an organization name.', true);
  try {
    if (state.identity.mode === 'demo') { state.workspace.name = name; state.workspace.industry = industry; }
    else { await updateOrganization(state.runtime, state.identity, { name, industry }); state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity); }
    renderWorkspace(); announce('Organization settings updated.');
  } catch (error) { announce(firebaseError(error), true); }
});

$('#organization-panel').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-rename-site], [data-rename-department]');
  if (!form) return;
  event.preventDefault();
  const name = new FormData(form).get('name').trim();
  if (!name) return;
  const siteId = form.dataset.renameSite;
  const departmentId = form.dataset.renameDepartment;
  const collectionName = siteId ? 'sites' : 'departments';
  const id = siteId || departmentId;
  try {
    if (state.identity.mode === 'demo') {
      const record = siteId ? state.workspace.sites.find((item) => item.id === id) : state.workspace.departments.find((item) => item.id === id);
      record.name = name;
    } else {
      await updateOrganizationRecord(state.runtime, state.identity, collectionName, id, { name });
      state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    }
    renderWorkspace(); announce(`${siteId ? 'Site' : 'Department'} updated.`);
  } catch (error) { announce(firebaseError(error), true); }
});

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const report = Object.fromEntries(values.entries());
  try {
    if (state.identity.mode === 'demo') {
      state.workspace.safetyReports.unshift({ ...report, id: `demo-report-${Date.now()}`, reporterUid: state.identity.uid, organizationId: state.identity.organizationId, status: 'open', createdAt: 'Just now' });
    } else {
      await createSafetyReport(state.runtime, state.identity, report);
      state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    }
    form.reset();
    renderWorkspace();
    announce('Safety report submitted. This is not an emergency dispatch service.');
  } catch (error) { announce(firebaseError(error), true); }
});

$('#report-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-report-update]');
  if (!button) return;
  const id = button.dataset.reportUpdate;
  const status = $(`#status-${CSS.escape(id)}`).value;
  if (!status) return announce(tr('report.chooseStatus', 'Choose a status first.'), true);
  try {
    if (state.identity.mode === 'demo') {
      const report = state.workspace.safetyReports.find((item) => item.id === id);
      report.status = status;
    } else {
      await transitionCloudSafetyReport(state.runtime, state.identity, id, status);
      state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    }
    renderWorkspace();
    announce(`Report status updated to ${status.replaceAll('_', ' ')}.`);
  } catch (error) { announce(firebaseError(error), true); }
});

$('#site-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = new FormData(event.currentTarget).get('name').trim();
  if (!name) return;
  try {
    if (state.identity.mode === 'demo') {
      let id = slug(name) || `site-${Date.now()}`;
      if (state.workspace.sites.some((site) => site.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`;
      state.workspace.sites.push({ id, name, addressLabel: 'Demo-created site' });
      state.identity.siteIds = state.workspace.sites.map((site) => site.id);
    } else {
      await createOrganizationRecord(state.runtime, state.identity, 'sites', { name, industry: state.workspace.organization.industry });
      state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    }
    event.currentTarget.reset(); renderWorkspace(); announce('Site added to the organization.');
  } catch (error) { announce(firebaseError(error), true); }
});

$('#department-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name')).trim(); const siteId = String(form.get('siteId'));
  try {
    if (state.identity.mode === 'demo') {
      let id = slug(name) || `department-${Date.now()}`;
      if (state.workspace.departments.some((item) => item.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`;
      state.workspace.departments.push({ id, name, siteId });
    } else {
      await createOrganizationRecord(state.runtime, state.identity, 'departments', { name, siteId });
      state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    }
    event.currentTarget.reset(); renderWorkspace(); announce('Department added to the organization.');
  } catch (error) { announce(firebaseError(error), true); }
});

$('#shift-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.reportValidity()) return;
  const form = new FormData(formElement);
  const selectedWorkers = getSelectedValues($('#shift-workers'));
  if (!selectedWorkers.length) return announce('Select at least one worker for this shift.', true);
  const shift = { title: String(form.get('title')).trim(), siteId: String(form.get('siteId')), departmentId: String(form.get('departmentId')), date: String(form.get('date')), startTime: String(form.get('startTime')), endTime: String(form.get('endTime')), workerUids: selectedWorkers, status: 'scheduled' };
  if (shift.endTime <= shift.startTime) return announce('Shift end must be later than its start on the same day.', true);
  try {
    if (state.identity.mode === 'demo') state.workspace.shifts.push({ ...shift, id: `demo-shift-${Date.now()}` });
    else { await createOrganizationRecord(state.runtime, state.identity, 'shifts', shift); state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity); }
    formElement.reset(); renderWorkspace(); announce('Shift created.');
  } catch (error) { announce(firebaseError(error), true); }
});

$('#member-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (state.identity.mode === 'demo') return announce('Member provisioning is disabled in demo mode; no account or role was changed.', true);
  try {
    await provisionMember(state.runtime, state.identity, {
      targetUid: String(form.get('targetUid')).trim(), role: String(form.get('role')),
      siteIds: getSelectedValues($('#member-sites')), departmentIds: getSelectedValues($('#member-departments'))
    });
    event.currentTarget.reset();
    state.workspace = await loadOrganizationWorkspace(state.runtime, state.identity);
    renderWorkspace(); announce('Worker or supervisor access provisioned. They need to sign out and back in to refresh role claims.');
  } catch (error) { announce(firebaseError(error), true); }
});

let preferredLanguage = 'en';
try { preferredLanguage = localStorage.getItem('workzenith.language') || 'en'; } catch {}
if (!['en', 'ta'].includes(preferredLanguage)) preferredLanguage = 'en';
setLanguage(preferredLanguage);
for (const [key, className, selector] of [['workzenith.largeText', 'large-text', '#large-text'], ['workzenith.highContrast', 'high-contrast', '#contrast']]) {
  let enabled = false;
  try { enabled = localStorage.getItem(key) === 'true'; } catch {}
  document.body.classList.toggle(className, enabled);
  $(selector).setAttribute('aria-pressed', String(enabled));
}
$('#shift-form [name="date"]').value = new Date().toISOString().slice(0, 10);
