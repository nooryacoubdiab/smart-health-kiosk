const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'kiosk.db'));

// Get the existing seed patients (uses your 10 patients, cycling through them)
const patients = db.prepare('SELECT id FROM patients').all();
if (patients.length === 0) {
    console.log('No patients found — run db/init.js first.');
    process.exit(1);
}

const departments = ['general', 'internal', 'dental', 'ent'];
const queueTypes = ['standard', 'standard', 'standard', 'priority']; // mostly standard, some priority

// Simulate a busy morning (8-9) and lunchtime (12-13), quiet mid-afternoon (15-16)
const hourPattern = [
    { hour: 8, count: 9 },
    { hour: 9, count: 12 },
    { hour: 10, count: 6 },
    { hour: 11, count: 4 },
    { hour: 12, count: 8 },
    { hour: 13, count: 7 },
    { hour: 14, count: 3 },
    { hour: 15, count: 2 },
];

const insert = db.prepare(`
  INSERT INTO queues (patient_id, department, queue_type, ticket_no, status, created_at)
  VALUES (?, ?, ?, ?, 'done', ?)
`);

let totalInserted = 0;
const today = new Date();
const dateStr = today.toISOString().split('T')[0]; // e.g. 2026-07-18

hourPattern.forEach(({ hour, count }) => {
    for (let i = 0; i < count; i++) {
        const patient = patients[Math.floor(Math.random() * patients.length)];
        const department = departments[Math.floor(Math.random() * departments.length)];
        const queueType = queueTypes[Math.floor(Math.random() * queueTypes.length)];
        const minute = Math.floor(Math.random() * 60).toString().padStart(2, '0');
        const createdAt = `${dateStr} ${hour.toString().padStart(2, '0')}:${minute}:00`;
        const ticketNo = `${queueType === 'priority' ? 'P' : 'S'}-${department.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        insert.run(patient.id, department, queueType, ticketNo, createdAt);
        totalInserted++;
    }
});

console.log(`Seeded ${totalInserted} demo queue entries across hours 8:00–15:00.`);
console.log('These are marked status="done" so they will NOT appear in the live dashboard queues,');
console.log('but WILL be counted by the peak-hour prediction feature.');

db.close();
