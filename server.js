const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin Key (In a real production app, use env vars, but hardcoded here for simplicity)
const ADMIN_KEY = process.env.ADMIN_KEY || 'gjl20010303';

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files (the frontend) from the current directory
app.use(express.static(path.join(__dirname)));

// Configure SQLite Database
const db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
        // Create table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE,
                subject TEXT,
                words TEXT
            )
        `);
    }
});

// --- API Endpoints ---

// 1. Get all units
app.get('/api/units', (req, res) => {
    db.all('SELECT * FROM units', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch units' });
        }

        // Convert array of rows into a dictionary mapping keys to objects
        const unitsDict = {};
        rows.forEach(row => {
            try {
                unitsDict[row.title] = {
                    subject: row.subject,
                    words: JSON.parse(row.words)
                };
            } catch (e) {
                console.error(`Error parsing JSON for unit ${row.title}`);
            }
        });

        res.json(unitsDict);
    });
});

// 2. Verify Admin
app.post('/api/verify-admin', (req, res) => {
    const { adminKey } = req.body;
    if (adminKey === ADMIN_KEY) {
        res.json({ success: true });
    } else {
        res.status(403).json({ error: 'Unauthorized' });
    }
});

// 3. Add or Update a unit
app.post('/api/units', (req, res) => {
    const { adminKey, title, subject, words } = req.body;

    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Unauthorized: Invalid Admin Key' });
    }

    if (!title || !subject || !words || !Array.isArray(words)) {
        return res.status(400).json({ error: 'Bad Request: Missing required fields or invalid words array' });
    }

    // Upsert logic (Insert or Replace)
    const wordsJson = JSON.stringify(words);
    const sql = `
        INSERT Into units (title, subject, words)
        VALUES (?, ?, ?)
        ON CONFLICT(title) DO UPDATE SET
            subject = excluded.subject,
            words = excluded.words
    `;

    db.run(sql, [title, subject, wordsJson], function (err) {
        if (err) {
            console.error('Error upserting unit', err);
            return res.status(500).json({ error: 'Failed to save unit' });
        }
        res.json({ success: true, message: `Unit ${title} saved successfully.` });
    });
});

// 3. Delete a unit
app.delete('/api/units/:title', (req, res) => {
    const title = req.params.title;
    const adminKey = req.headers['x-admin-key'];

    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    db.run('DELETE FROM units WHERE title = ?', [title], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete unit' });
        }
        res.json({ success: true, message: 'Unit deleted' });
    });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
