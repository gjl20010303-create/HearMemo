const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'gjl20010303';
const JWT_SECRET = process.env.JWT_SECRET || 'hearmemo_jwt_secret_2024';

// Middleware
app.use(cors());
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const decodedUrl = decodeURIComponent(req.originalUrl);
    console.log(`[${time}] ${req.method} ${decodedUrl} - 来自 IP: ${ip}`);
    next();
});

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// ---- Database Setup ----
const db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');

        // Units table — add grade column if not exists
        db.run(`
            CREATE TABLE IF NOT EXISTS units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE,
                subject TEXT,
                grade TEXT DEFAULT 'all',
                words TEXT
            )
        `);

        // Try to add grade column to existing tables (safe, ignores if exists)
        db.run(`ALTER TABLE units ADD COLUMN grade TEXT DEFAULT 'all'`, () => { });

        // Users table for student login
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                grade TEXT NOT NULL
            )
        `);
    }
});

// ---- Auth Middleware ----
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
        req.user = user;
        next();
    });
}

// ---- API Endpoints ----

// Register new student
app.post('/api/register', async (req, res) => {
    const { username, password, grade } = req.body;

    if (!username || !password || !grade) {
        return res.status(400).json({ error: '用户名、密码和年级不能为空' });
    }
    if (!['4', '5'].includes(String(grade))) {
        return res.status(400).json({ error: '年级只能是四年级(4)或五年级(5)' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password_hash, grade) VALUES (?, ?, ?)',
            [username.trim(), hash, String(grade)],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ error: '该用户名已被注册，请换一个' });
                    }
                    return res.status(500).json({ error: '注册失败' });
                }
                const token = jwt.sign({ id: this.lastID, username: username.trim(), grade: String(grade) }, JWT_SECRET, { expiresIn: '30d' });
                res.json({ success: true, token, grade: String(grade), username: username.trim() });
            }
        );
    } catch (e) {
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username.trim()], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: '用户名或密码错误' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: '用户名或密码错误' });

        const token = jwt.sign({ id: user.id, username: user.username, grade: user.grade }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, grade: user.grade, username: user.username });
    });
});

// Verify current token / get current user info
app.get('/api/me', authenticateToken, (req, res) => {
    res.json({ username: req.user.username, grade: req.user.grade });
});

// 1. Get units — filtered by student's grade from JWT
app.get('/api/units', authenticateToken, (req, res) => {
    const userGrade = req.user.grade;

    // Return units that are 'all' grade or match the student's grade
    db.all("SELECT * FROM units WHERE grade = 'all' OR grade = ?", [userGrade], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch units' });
        }

        const unitsDict = {};
        rows.forEach(row => {
            try {
                unitsDict[row.title] = {
                    subject: row.subject,
                    grade: row.grade,
                    words: JSON.parse(row.words)
                };
            } catch (e) {
                console.error(`Error parsing JSON for unit ${row.title}`);
            }
        });

        res.json(unitsDict);
    });
});

// 1.5. Dynamic Edge TTS — Chinese voice upgraded to YunxiNeural
const ttsEngine = new MsEdgeTTS();
app.get('/api/tts', async (req, res) => {
    const { text, lang } = req.query;
    if (!text) return res.status(400).send('Text is required');

    let voice = 'en-US-AriaNeural';
    if (lang === 'zh' || /[\u4e00-\u9fa5]/.test(text)) {
        voice = 'zh-CN-YunxiNeural'; // Upgraded: natural male Chinese voice
    }

    try {
        await ttsEngine.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store'); // Do not cache so voice model changes apply immediately
        const readable = ttsEngine.toStream(text);
        readable.pipe(res);
        readable.on('error', (err) => {
            console.error('TTS Stream Error:', err);
            if (!res.headersSent) res.status(500).send('TTS Streaming Failed');
        });
    } catch (err) {
        console.error('TTS Setup Error:', err);
        if (!res.headersSent) res.status(500).send('TTS Setup Failed');
    }
});

// Admin login: return a JWT with isAdmin=true and grade='all'
app.post('/api/admin-login', async (req, res) => {
    const { adminKey } = req.body;
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: '管理员密码错误' });
    }
    const token = jwt.sign(
        { id: 0, username: '教师', grade: 'all', isAdmin: true },
        JWT_SECRET,
        { expiresIn: '90d' }
    );
    res.json({ success: true, token, username: '教师', grade: 'all', isAdmin: true });
});

// 2. Verify Admin (kept for backward compatibility)
app.post('/api/verify-admin', (req, res) => {
    const { adminKey } = req.body;
    if (adminKey === ADMIN_KEY) {
        res.json({ success: true });
    } else {
        res.status(403).json({ error: 'Unauthorized' });
    }
});

// 3. Add or Update a unit (admin only, now includes grade)
app.post('/api/units', (req, res) => {
    const { adminKey, title, subject, grade, words } = req.body;

    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Unauthorized: Invalid Admin Key' });
    }

    if (!title || !subject || !words || !Array.isArray(words)) {
        return res.status(400).json({ error: 'Bad Request: Missing required fields' });
    }

    const unitGrade = grade || 'all';
    const wordsJson = JSON.stringify(words);
    const sql = `
        INSERT INTO units (title, subject, grade, words)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(title) DO UPDATE SET
            subject = excluded.subject,
            grade = excluded.grade,
            words = excluded.words
    `;

    db.run(sql, [title, subject, unitGrade, wordsJson], function (err) {
        if (err) {
            console.error('Error upserting unit', err);
            return res.status(500).json({ error: 'Failed to save unit' });
        }
        res.json({ success: true, message: `Unit ${title} saved successfully.` });
    });
});

// 4. Delete a unit (admin only)
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
    console.log('--- 实时访问日志将显示在下方 ---');
});
