// Explicitly fictional sample content. Never used as a fallback for Firebase data.
export const SAMPLE_METRICS = [
  { label: 'On shift today', value: '128', foot: 'Across 3 departments', tone: 'good' },
  { label: 'Attendance', value: '94%', foot: '↑ 2% from last week', tone: 'good' },
  { label: 'Open reports', value: '06', foot: '2 need a review', tone: 'amber' },
  { label: 'Fatigue check-ins', value: '03', foot: 'Private follow-up suggested', tone: 'amber' }
];
export const SAMPLE_ACTIVITY = [
  { icon: '↗', title: 'Shift handover completed', detail: 'Facilities · 07:12', status: 'Recorded' },
  { icon: '＋', title: 'Safety report submitted', detail: 'Ground floor · 07:46', status: 'Review needed', tone: 'amber' },
  { icon: '✓', title: 'Training record verified', detail: 'Infection control · Yesterday', status: 'Complete' }
];

// Seed data is explicitly fictional and is only used after a person chooses Demo mode.
// Both industries use the same site/department/shift/attendance/report record shape.
export const DEMO_ORGANIZATIONS = {
  construction: {
    id: 'demo-northline', name: 'Northline Build Co.', industry: 'construction',
    sites: [
      { id: 'riverside', name: 'Riverside site', addressLabel: 'Riverside development' },
      { id: 'hillview', name: 'Hillview site', addressLabel: 'Hillview expansion' }
    ],
    departments: [
      { id: 'site-operations', name: 'Site operations', siteId: 'riverside' },
      { id: 'site-safety', name: 'Safety', siteId: 'riverside' },
      { id: 'civil-works', name: 'Civil works', siteId: 'hillview' }
    ],
    members: [
      { uid: 'demo-worker', displayName: 'Arun Kumar', role: 'worker', siteIds: ['riverside'], departmentId: 'site-operations' },
      { uid: 'demo-worker-2', displayName: 'Maya Perera', role: 'worker', siteIds: ['hillview'], departmentId: 'civil-works' },
      { uid: 'demo-supervisor', displayName: 'Nimal Silva', role: 'supervisor', siteIds: ['riverside'], departmentId: 'site-operations' }
    ],
    shifts: [
      { id: 'construct-shift-1', title: 'General site operations', siteId: 'riverside', departmentId: 'site-operations', date: '2026-10-27', startTime: '07:00', endTime: '15:30', workerUids: ['demo-worker'], status: 'scheduled' },
      { id: 'construct-shift-2', title: 'Civil works crew', siteId: 'hillview', departmentId: 'civil-works', date: '2026-10-27', startTime: '07:30', endTime: '16:00', workerUids: ['demo-worker-2'], status: 'scheduled' }
    ],
    attendance: [
      { id: 'att-construct-1', workerUid: 'demo-worker-2', shiftId: 'construct-shift-2', siteId: 'hillview', checkInAt: '07:29', checkOutAt: null, status: 'checked_in', recordedMinutes: 0 }
    ],
    safetyReports: [
      { id: 'report-construct-1', reporterUid: 'demo-worker', title: 'Loose cable near the walkway', category: 'hazard', severity: 'medium', siteId: 'riverside', status: 'open', createdAt: 'Today · 07:40' }
    ]
  },
  education: {
    id: 'demo-lakemont', name: 'Lakemont College', industry: 'education',
    sites: [
      { id: 'central-campus', name: 'Central campus', addressLabel: 'Main campus' },
      { id: 'north-campus', name: 'North campus', addressLabel: 'North learning center' }
    ],
    departments: [
      { id: 'housekeeping', name: 'Housekeeping', siteId: 'central-campus' },
      { id: 'maintenance', name: 'Maintenance', siteId: 'central-campus' },
      { id: 'campus-support', name: 'Campus support', siteId: 'north-campus' }
    ],
    members: [
      { uid: 'demo-worker', displayName: 'Arun Kumar', role: 'worker', siteIds: ['central-campus'], departmentId: 'housekeeping' },
      { uid: 'demo-worker-2', displayName: 'Maya Perera', role: 'worker', siteIds: ['north-campus'], departmentId: 'campus-support' },
      { uid: 'demo-supervisor', displayName: 'Nimal Silva', role: 'supervisor', siteIds: ['central-campus'], departmentId: 'maintenance' }
    ],
    shifts: [
      { id: 'college-shift-1', title: 'Housekeeping day shift', siteId: 'central-campus', departmentId: 'housekeeping', date: '2026-10-27', startTime: '08:00', endTime: '16:00', workerUids: ['demo-worker'], status: 'scheduled' },
      { id: 'college-shift-2', title: 'Campus support shift', siteId: 'north-campus', departmentId: 'campus-support', date: '2026-10-27', startTime: '09:00', endTime: '17:00', workerUids: ['demo-worker-2'], status: 'scheduled' }
    ],
    attendance: [
      { id: 'att-college-1', workerUid: 'demo-worker-2', shiftId: 'college-shift-2', siteId: 'north-campus', checkInAt: '08:58', checkOutAt: null, status: 'checked_in', recordedMinutes: 0 }
    ],
    safetyReports: [
      { id: 'report-college-1', reporterUid: 'demo-worker', title: 'Cleaning supplies need restocking', category: 'equipment', severity: 'low', siteId: 'central-campus', status: 'acknowledged', createdAt: 'Today · 09:10' }
    ]
  }
};
