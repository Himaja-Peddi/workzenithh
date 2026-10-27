export const INDUSTRIES = {
  construction: { label: 'Construction', organization: 'Northline Build Co.', site: 'Riverside site', departments: ['Site operations', 'Safety'], roles: ['Site worker', 'Safety officer', 'Supervisor'], workflows: ['Site check-in', 'Safety observations', 'Toolbox training'], riskLabel: 'Open safety items' },
  hospital: { label: 'Hospital', organization: 'Greenview Hospital', site: 'Main campus', departments: ['Facilities', 'Sanitation', 'Patient support'], roles: ['Support worker', 'Facilities lead', 'Supervisor'], workflows: ['Ward shift handover', 'Infection control reports', 'Fatigue checks'], riskLabel: 'Open safety items' },
  education: { label: 'College or school', organization: 'Lakemont College', site: 'Central campus', departments: ['Facilities', 'Catering', 'Transport'], roles: ['Campus staff', 'Department lead', 'Supervisor'], workflows: ['Campus shift check-in', 'Facilities reports', 'Training records'], riskLabel: 'Open site items' },
  factory: { label: 'Factory', organization: 'Eastworks Manufacturing', site: 'Assembly plant', departments: ['Assembly', 'Quality', 'Warehouse'], roles: ['Line operator', 'Shift lead', 'Safety officer'], workflows: ['Line shift handover', 'Machine safety reports', 'Skill records'], riskLabel: 'Open safety items' }
};

export const FEATURES = [
  { icon: '◷', title: 'Shifts & attendance', body: 'Clear check-in records, shift history and overtime visibility.' },
  { icon: '＋', title: 'Safety & voice', body: 'Raise concerns, follow progress and share feedback privately.' },
  { icon: '▤', title: 'Pay & skills', body: 'Understand pay details and keep training records in one place.' },
  { icon: '⌁', title: 'Workforce health', body: 'See explainable fatigue signals and site-level trends.' }
];
