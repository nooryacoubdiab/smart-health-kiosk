const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'kiosk.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema);

console.log('Database initialized at', dbPath);
console.log('Tables created: patients, vitals, queues');

db.close();