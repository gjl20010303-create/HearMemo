/**
 * One-time script to fix sprint progress positions.
 * Run on server: node fix-progress.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.RENDER ? '/opt/render/project/data' : __dirname;
const dbPath = path.join(DATA_DIR, 'data.db');
const db = new sqlite3.Database(dbPath);

const fmt = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

db.all("SELECT * FROM units WHERE grade = '9' AND subject = 'en' ORDER BY id ASC", [], (err, rows) => {
    if (err) { console.error('读取词库失败:', err); db.close(); return; }

    let allWords = [];
    rows.forEach(row => {
        try { allWords = allWords.concat(JSON.parse(row.words)); } catch (e) {}
    });
    console.log(`九年级词库共 ${allWords.length} 词`);

    const todayStr = fmt(new Date());
    const nextStr = fmt(new Date(Date.now() + 2 * 86400000));  // nextReviewDate: 2天后

    // ---- 配置：哪个 user_id 调到第几天 ----
    const targets = [
        { userId: 6, username: 'lucian', seenCount: 100 },  // Day 3 = 已背前100词
        // 教师 (user_id=0) 清空 → Day 1
        { userId: 0, username: '教师', seenCount: 0 },
    ];

    let done = 0;
    targets.forEach(({ userId, username, seenCount }) => {
        if (seenCount === 0) {
            db.run('DELETE FROM ebbinghaus WHERE user_id = ?', [userId], err => {
                if (err) console.error(`${username} 清空失败:`, err);
                else console.log(`${username} (user_id=${userId}) → 已清空，下次背 Day 1`);
                if (++done === targets.length) db.close();
            });
            return;
        }

        const seenWords = allWords.slice(0, seenCount);
        const data = {};
        seenWords.forEach(w => {
            data[w.word] = {
                word: w.word,
                meaning: w.meaning || '',
                subject: 'en',
                level: 1,
                nextReviewDate: nextStr,
                lastReviewDate: todayStr,
                mistakes: 1
            };
        });

        db.run(
            'INSERT OR REPLACE INTO ebbinghaus (user_id, data, updated_at) VALUES (?, ?, ?)',
            [userId, JSON.stringify(data), new Date().toISOString()],
            err => {
                if (err) console.error(`${username} 更新失败:`, err);
                else console.log(`${username} (user_id=${userId}) → Day ${seenCount / 50 + 1}，已标记前 ${seenCount} 词为已背`);
                if (++done === targets.length) db.close();
            }
        );
    });
});
