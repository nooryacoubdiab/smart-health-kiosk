CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  national_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  insurance_no TEXT,
  has_history INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  bp_sys INTEGER,
  bp_dia INTEGER,
  pulse INTEGER,
  spo2 INTEGER,
  temp REAL,
  source TEXT DEFAULT 'manual',
  recorded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  department TEXT NOT NULL DEFAULT 'general',
  queue_type TEXT NOT NULL,
  ticket_no TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('9876543210', 'Ahmad Nasser', 34, 'INS-1001', 0);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('1234567890', 'Rania Khalil', 67, 'INS-2002', 1);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('1122334455', 'Yousef Odeh', 8, 'INS-3003', 0);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('2233445566', 'Huda Salameh', 52, 'INS-4004', 1);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('3344556677', 'Omar Fayez', 29, 'INS-5005', 0);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('4455667788', 'Lina Awad', 74, 'INS-6006', 1);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('5566778899', 'Karim Btoush', 41, 'INS-7007', 1);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('6677889900', 'Dana Freij', 19, 'INS-8008', 0);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('7788990011', 'Samir Haddad', 58, 'INS-9009', 1);

INSERT OR IGNORE INTO patients (national_id, name, age, insurance_no, has_history)
VALUES ('8899001122', 'Noor Hijazi', 25, 'INS-1010', 0);