const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;
const db = new Database(path.join(__dirname, 'db', 'kiosk.db'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEPARTMENTS = ['general', 'beds', 'dental', 'maternity', 'labs', 'radiology', 'pharmacy', 'internal', 'chest', 'ent'];
const WAIT_MINUTES_PER_PATIENT = 12;

function classifyTriage({ bp_sys, bp_dia, spo2, temp, pulse }) {
    const isEmergency =
        (temp != null && (temp >= 41 || temp < 35)) ||
        (bp_sys != null && (bp_sys >= 180 || bp_sys < 90)) ||
        (bp_dia != null && (bp_dia >= 120 || bp_dia < 50)) ||
        (pulse != null && (pulse >= 130 || pulse < 40)) ||
        (spo2 != null && spo2 < 90);
    if (isEmergency) return 'emergency';

    const isPriority =
        (temp != null && ((temp > 37 && temp < 41) || (temp >= 35 && temp < 36))) ||
        (bp_sys != null && ((bp_sys > 135 && bp_sys < 180) || (bp_sys >= 90 && bp_sys < 105))) ||
        (bp_dia != null && ((bp_dia > 95 && bp_dia < 120) || (bp_dia >= 50 && bp_dia < 65))) ||
        (pulse != null && ((pulse > 100 && pulse < 130) || (pulse >= 40 && pulse < 60))) ||
        (spo2 != null && spo2 >= 90 && spo2 < 95);
    if (isPriority) return 'priority';

    return 'standard';
}

function generateTicketNo(queueType, department) {
    const prefix = queueType === 'emergency' ? 'ER' : queueType === 'priority' ? 'P' : 'S';
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefix}-${department.slice(0, 3).toUpperCase()}-${rand}`;
}

function validateVitals({ bp_sys, bp_dia, spo2, temp, pulse }) {
    if (bp_sys != null && (bp_sys < 40 || bp_sys > 250)) {
        return 'Systolic blood pressure must be between 40 and 250.';
    }
    if (bp_dia != null && (bp_dia < 20 || bp_dia > 150)) {
        return 'Diastolic blood pressure must be between 20 and 150.';
    }
    if (spo2 != null && (spo2 < 0 || spo2 > 100)) {
        return 'SpO2 must be between 0 and 100.';
    }
    if (temp != null && (temp < 30 || temp > 45)) {
        return 'Temperature must be between 30 and 45°C.';
    }
    if (pulse != null && (pulse < 20 || pulse > 220)) {
        return 'Pulse must be between 20 and 220.';
    }
    return null;
}

// ---------- Active session tracking ----------
let activeSessionNationalId = null;

app.post('/api/session/start', (req, res) => {
    const { national_id } = req.body;
    activeSessionNationalId = national_id || null;
    res.json({ status: 'started', national_id: activeSessionNationalId });
});

app.post('/api/session/end', (req, res) => {
    activeSessionNationalId = null;
    res.json({ status: 'ended' });
});

app.get('/api/session/current', (req, res) => {
    res.json({ national_id: activeSessionNationalId });
});

// ---------- GET /api/patient/:national_id ----------
app.get('/api/patient/:national_id', (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE national_id = ?').get(req.params.national_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
});

// ---------- GET /api/departments ----------
app.get('/api/departments', (req, res) => {
    res.json({ departments: DEPARTMENTS });
});

// ---------- POST /api/triage-check ----------
app.post('/api/triage-check', (req, res) => {
    const { bp_sys, bp_dia, pulse, spo2, temp } = req.body;
    const validationError = validateVitals({ bp_sys, bp_dia, spo2, temp, pulse });
    if (validationError) return res.status(400).json({ error: validationError });
    const level = classifyTriage({ bp_sys, bp_dia, spo2, temp, pulse });
    res.json({ level });
});

// ---------- POST /api/vitals ----------
app.post('/api/vitals', (req, res) => {
    const { national_id, bp_sys, bp_dia, pulse, spo2, temp, department, source } = req.body;

    const patient = db.prepare('SELECT * FROM patients WHERE national_id = ?').get(national_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const validationError = validateVitals({ bp_sys, bp_dia, spo2, temp, pulse });
    if (validationError) return res.status(400).json({ error: validationError });

    db.prepare(
        `INSERT INTO vitals (patient_id, bp_sys, bp_dia, pulse, spo2, temp, source) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(patient.id, bp_sys || null, bp_dia || null, pulse || null, spo2 || null, temp || null, source || 'manual');

    const level = classifyTriage({ bp_sys, bp_dia, spo2, temp, pulse });

    if (level === 'emergency') {
        db.prepare(
            `INSERT INTO queues (patient_id, department, queue_type, ticket_no, status) VALUES (?, 'emergency', 'emergency', ?, 'alert')`
        ).run(patient.id, generateTicketNo('emergency', 'emergency'));

        return res.json({
            patient_name: patient.name,
            queue_type: 'emergency',
            message_en: 'Please proceed to the Emergency Department immediately.',
            message_ar: 'الرجاء التوجه لقسم الطوارئ فورًا.',
        });
    }

    let finalDepartment = 'general';
    if (patient.has_history === 1 && department && DEPARTMENTS.includes(department)) {
        finalDepartment = department;
    }

    const ticketNo = generateTicketNo(level, finalDepartment);

    const result = db.prepare(
        `INSERT INTO queues (patient_id, department, queue_type, ticket_no) VALUES (?, ?, ?, ?)`
    ).run(patient.id, finalDepartment, level, ticketNo);

    let aheadCount;
    if (level === 'priority') {
        aheadCount = db.prepare(`
      SELECT COUNT(*) AS c FROM queues
      WHERE department = ? AND queue_type = 'priority' AND status = 'waiting' AND id != ?
    `).get(finalDepartment, result.lastInsertRowid).c;
    } else {
        const priorityAhead = db.prepare(`
      SELECT COUNT(*) AS c FROM queues
      WHERE department = ? AND queue_type = 'priority' AND status = 'waiting'
    `).get(finalDepartment).c;
        const standardAhead = db.prepare(`
      SELECT COUNT(*) AS c FROM queues
      WHERE department = ? AND queue_type = 'standard' AND status = 'waiting' AND id != ?
    `).get(finalDepartment, result.lastInsertRowid).c;
        aheadCount = priorityAhead + standardAhead;
    }
    const estimatedWaitMinutes = aheadCount * WAIT_MINUTES_PER_PATIENT;

    res.json({
        patient_name: patient.name,
        ticket_no: ticketNo,
        queue_type: level,
        department: finalDepartment,
        queue_id: result.lastInsertRowid,
        estimated_wait_minutes: estimatedWaitMinutes,
    });
});

// ---------- GET /api/queue ----------
app.get('/api/queue', (req, res) => {
    const { department } = req.query;
    const rows = department
        ? db.prepare(`
        SELECT q.id, q.ticket_no, q.department, q.queue_type, q.status, q.created_at,
               p.name, p.age, p.national_id
        FROM queues q JOIN patients p ON p.id = q.patient_id
        WHERE q.status = 'waiting' AND q.department = ?
        ORDER BY (q.queue_type = 'priority') DESC, q.created_at ASC
      `).all(department)
        : db.prepare(`
        SELECT q.id, q.ticket_no, q.department, q.queue_type, q.status, q.created_at,
               p.name, p.age, p.national_id
        FROM queues q JOIN patients p ON p.id = q.patient_id
        WHERE q.status = 'waiting'
        ORDER BY (q.queue_type = 'priority') DESC, q.created_at ASC
      `).all();
    res.json(rows);
});

// ---------- POST /api/queue/:id/call ----------
app.post('/api/queue/:id/call', (req, res) => {
    const result = db.prepare(`UPDATE queues SET status = 'called' WHERE id = ? AND status = 'waiting'`)
        .run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Ticket not found or already called' });
    res.json({ status: 'called' });
});

// ---------- GET /api/alerts ----------
app.get('/api/alerts', (req, res) => {
    const rows = db.prepare(`
    SELECT q.id, q.ticket_no, q.created_at, p.name, p.age, p.national_id
    FROM queues q JOIN patients p ON p.id = q.patient_id
    WHERE q.status = 'alert'
    ORDER BY q.created_at DESC
  `).all();
    res.json(rows);
});

// ---------- POST /api/alerts/:id/resolve ----------
app.post('/api/alerts/:id/resolve', (req, res) => {
    const result = db.prepare(`UPDATE queues SET status = 'done' WHERE id = ? AND status = 'alert'`)
        .run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ status: 'resolved' });
});

// ---------- GET /api/predict-peak ----------
app.get('/api/predict-peak', (req, res) => {
    const rows = db.prepare(`
    SELECT strftime('%H', created_at) AS hour, COUNT(*) AS total_visits
    FROM queues GROUP BY hour ORDER BY hour
  `).all();
    if (rows.length === 0) return res.json({ message: 'Not enough data yet', hours: [] });
    const busiest = rows.reduce((a, b) => (b.total_visits > a.total_visits ? b : a));
    const quietest = rows.reduce((a, b) => (b.total_visits < a.total_visits ? b : a));
    res.json({ hourly_breakdown: rows, busiest_hour: busiest.hour, recommended_offpeak_hour: quietest.hour });
});

// ---------- GET /api/stats ----------
app.get('/api/stats', (req, res) => {
    const period = req.query.period || 'today';
    let dateFilter;
    switch (period) {
        case 'month': dateFilter = `created_at >= datetime('now', '-1 month')`; break;
        case '6months': dateFilter = `created_at >= datetime('now', '-6 months')`; break;
        case 'year': dateFilter = `created_at >= datetime('now', '-1 year')`; break;
        default: dateFilter = `date(created_at) = date('now')`;
    }

    const perDept = db.prepare(`
    SELECT department,
           COUNT(*) AS total,
           SUM(CASE WHEN queue_type = 'priority' THEN 1 ELSE 0 END) AS priority_count,
           SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS currently_waiting
    FROM queues
    WHERE ${dateFilter} AND department != 'emergency'
    GROUP BY department
  `).all();

    const emergencyCount = db.prepare(`
    SELECT COUNT(*) AS c FROM queues WHERE queue_type = 'emergency' AND ${dateFilter}
  `).get().c;

    const total = db.prepare(`
    SELECT COUNT(*) AS c FROM queues WHERE ${dateFilter}
  `).get().c;

    res.json({ period, per_department: perDept, emergency_today: emergencyCount, total_today: total });
});

// ---------- POST /api/sensor-reading ----------
app.post('/api/sensor-reading', (req, res) => {
    const { national_id, pulse, spo2, temp } = req.body;
    const patient = db.prepare('SELECT * FROM patients WHERE national_id = ?').get(national_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    db.prepare(`INSERT INTO vitals (patient_id, pulse, spo2, temp, source) VALUES (?, ?, ?, ?, 'sensor')`)
        .run(patient.id, pulse || null, spo2 || null, temp || null);
    res.json({ status: 'stored' });
});

// ---------- GET /api/latest-vitals/:national_id ----------
app.get('/api/latest-vitals/:national_id', (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE national_id = ?').get(req.params.national_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const reading = db.prepare(`
    SELECT * FROM vitals WHERE patient_id = ? AND source = 'sensor'
    AND recorded_at >= datetime('now', '-2 minutes') ORDER BY recorded_at DESC LIMIT 1
  `).get(patient.id);
    res.json({ reading: reading || null });
});

app.listen(PORT, () => {
    console.log(`Smart Health Kiosk API running on http://localhost:${PORT}`);
});
