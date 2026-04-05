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
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || '';

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
// On Render: use /opt/render/project/data for persistence (attach a Disk there)
// Locally: use current directory
const fs = require('fs');
const DATA_DIR = process.env.RENDER ? '/opt/render/project/data' : __dirname;
if (process.env.RENDER && !fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const dbPath = path.join(DATA_DIR, 'data.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
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

        // Ebbinghaus cloud sync table (one JSON blob per user)
        db.run(`
            CREATE TABLE IF NOT EXISTS ebbinghaus (
                user_id INTEGER NOT NULL PRIMARY KEY,
                data TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
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

// Helper: check whether request is from admin (adminKey in body OR admin JWT)
function isAdminRequest(req) {
    const bodyKey = req.body && req.body.adminKey;
    if (bodyKey === ADMIN_KEY) return true;

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.isAdmin || decoded.grade === 'all') return true;
        } catch (e) { }
    }
    return false;
}

// ---- API Endpoints ----

// Register new student
app.post('/api/register', async (req, res) => {
    const { username, password, grade } = req.body;

    if (!username || !password || !grade) {
        return res.status(400).json({ error: '用户名、密码和年级不能为空' });
    }
    if (!['4', '5', '7', '8', '9'].includes(String(grade))) {
        return res.status(400).json({ error: '年级只能是四(4)、五(5)、七(7)、八(8)或九年级(9)' });
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

// 1. Get units — filtered by student's grade from JWT; admin sees all
app.get('/api/units', authenticateToken, (req, res) => {
    const userGrade = req.user.grade;

    let sql, params;
    if (userGrade === 'all') {
        // Admin sees everything
        sql = 'SELECT * FROM units';
        params = [];
    } else {
        sql = "SELECT * FROM units WHERE grade = 'all' OR grade = ?";
        params = [userGrade];
    }

    db.all(sql, params, (err, rows) => {
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

// 1.1 Sprint words — STRICTLY grade=9 only (no 'all', no grade 4/5)
app.get('/api/sprint-words', authenticateToken, (req, res) => {
    db.all("SELECT * FROM units WHERE grade = '9' AND subject = 'en' ORDER BY id ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch sprint words' });

        let words = [];
        rows.forEach(row => {
            try {
                const parsed = JSON.parse(row.words);
                words = words.concat(parsed);
            } catch (e) {
                console.error(`Error parsing unit ${row.title}`);
            }
        });

        res.json(words);
    });
});

// 1.2 Get Ebbinghaus data for current user (cloud sync)
app.get('/api/ebbinghaus', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.get('SELECT data FROM ebbinghaus WHERE user_id = ?', [userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        let data = {};
        if (row) { try { data = JSON.parse(row.data); } catch (e) {} }
        res.json({ data });
    });
});

// 1.3 Save Ebbinghaus data for current user (cloud sync)
app.post('/api/ebbinghaus', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { data } = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });
    const now = new Date().toISOString();
    db.run(
        'INSERT OR REPLACE INTO ebbinghaus (user_id, data, updated_at) VALUES (?, ?, ?)',
        [userId, JSON.stringify(data), now],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save' });
            res.json({ success: true });
        }
    );
});

// 1.5. Dynamic Edge TTS — High quality neural voices
// Chinese: YunyangNeural (male, news broadcaster, very clear)
// English: AriaNeural (female, natural)
app.get('/api/tts', async (req, res) => {
    const { text, lang } = req.query;
    if (!text) return res.status(400).send('Text is required');

    let voice = 'en-US-AriaNeural'; // female English
    if (lang === 'zh' || /[\u4e00-\u9fa5]/.test(text)) {
        voice = 'zh-CN-YunyangNeural'; // male Chinese, news broadcaster style
    }

    try {
        const ttsEngine = new MsEdgeTTS();
        await ttsEngine.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        const { audioStream } = ttsEngine.toStream(text);
        audioStream.pipe(res);
        audioStream.on('error', (err) => {
            console.error('TTS Stream Error:', err);
            if (!res.headersSent) res.status(500).send('TTS Streaming Failed');
        });
    } catch (err) {
        console.error('TTS Setup Error:', err);
        if (!res.headersSent) res.status(500).send('TTS Setup Failed');
    }
});

// 1.6. DeepSeek AI Hint — concise word meaning
app.get('/api/hint', async (req, res) => {
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word is required' });
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'DeepSeek API key not configured' });

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                max_tokens: 50,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: '你是小学语文老师。用一句极简短的话解释词语含义，帮助学生听写时联想。不超过15个字。' },
                    { role: 'user', content: word }
                ]
            })
        });

        const data = await response.json();
        const hint = data.choices?.[0]?.message?.content?.trim() || '暂无提示';
        res.json({ hint });
    } catch (err) {
        console.error('DeepSeek API Error:', err);
        res.status(500).json({ error: 'AI提示生成失败' });
    }
});

// 1.7. DeepSeek AI Check Meaning — check if user's typed Chinese is correct
app.post('/api/check_meaning', async (req, res) => {
    const { word, target_meaning, user_input } = req.body;
    if (!word || !target_meaning || !user_input) return res.status(400).json({ error: 'Missing parameters' });
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'DeepSeek API key not configured' });

    const prompt = `你是一个宽容且智能的英语老师，负责批改九年级学生的单词翻译，评判标准以理解为主，不要过分苛求措辞。
单词: ${word}
标准答案: ${target_meaning}
学生输入: ${user_input}

请判断学生的输入：
- 如果学生的输入能体现单词的核心含义，即使用词不完全相同、有所简略或使用了同义表达，也评定为 correct。
- 如果学生的输入只写出了极少部分意思，或与标准答案存在明显偏差，评定为 fuzzy。
- 如果完全错误或与单词含义毫不相关，评定为 error。

请只返回一个如下格式的JSON对象，不要输出任何其他多余文本：
{"result": "correct|fuzzy|error"}`;

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                max_tokens: 30,
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'You are a lenient grading assistant. Output strict JSON only.' },
                    { role: 'user', content: prompt }
                ]
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        let result = 'error';
        try {
            const parsed = JSON.parse(content);
            if (parsed.result) result = parsed.result;
        } catch(e) {
            console.error('JSON Parse Error for DeepSeek check_meaning:', content);
        }
        res.json({ result });
    } catch (err) {
        console.error('DeepSeek Check Meaning Error:', err);
        res.status(500).json({ error: 'AI校验失败' });
    }
});


// In-memory cache for etymology results (avoids duplicate AI calls per word)
const etymologyCache = new Map();

// 1.8. Etymology — word root and affix analysis for junior/senior high students
app.get('/api/etymology', async (req, res) => {
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word is required' });
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'DeepSeek API key not configured' });

    if (etymologyCache.has(word)) {
        return res.json({ word, etymology: etymologyCache.get(word) });
    }

    const prompt = `分析英语单词"${word}"的词根词缀，帮助初中生记忆：
1. 标注词根/前缀/后缀及各自含义（例：en-使...+ viron周围 + -ment名词后缀）
2. 一句话联想记忆小技巧（不超过20字）
3. 同根词1-2个举例

用中文解释，格式简洁，总字数不超过100字。`;

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                max_tokens: 200,
                temperature: 0.4,
                messages: [
                    { role: 'system', content: '你是英语词汇专家，专门帮助初中生用词根词缀法记单词。回答简洁有趣，适合中学生阅读。' },
                    { role: 'user', content: prompt }
                ]
            })
        });

        const data = await response.json();
        const etymology = data.choices?.[0]?.message?.content?.trim() || '暂无词根词缀信息';
        etymologyCache.set(word, etymology);
        res.json({ word, etymology });
    } catch (err) {
        console.error('Etymology API Error:', err);
        res.status(500).json({ error: '词根词缀获取失败' });
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
    if (!isAdminRequest(req)) {
        return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    const { title, subject, grade, words } = req.body;

    if (!title || !subject || !words || !Array.isArray(words)) {
        return res.status(400).json({ error: 'Bad Request: Missing required fields' });
    }

    const unitGrade = grade || 'all';
    const wordsJson = JSON.stringify(words);

    db.get('SELECT id FROM units WHERE title = ?', [title], (err, row) => {
        if (err) {
            console.error('Error checking unit existence:', err.message);
            return res.status(500).json({ error: `查询单元失败: ${err.message}` });
        }

        if (row) {
            // Update existing
            const sql = 'UPDATE units SET subject = ?, grade = ?, words = ? WHERE title = ?';
            db.run(sql, [subject, unitGrade, wordsJson, title], function (err) {
                if (err) return res.status(500).json({ error: `更新单元失败: ${err.message}` });
                res.json({ success: true, message: `Unit ${title} updated successfully.` });
            });
        } else {
            // Insert new
            const sql = 'INSERT INTO units (title, subject, grade, words) VALUES (?, ?, ?, ?)';
            db.run(sql, [title, subject, unitGrade, wordsJson], function (err) {
                if (err) return res.status(500).json({ error: `创建单元失败: ${err.message}` });
                res.json({ success: true, message: `Unit ${title} created successfully.` });
            });
        }
    });
});

// 4. Delete a unit (admin only)
app.delete('/api/units/:title', (req, res) => {
    if (!isAdminRequest(req)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const title = req.params.title;
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
