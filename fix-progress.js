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

    // Lucian 的真实背词记录：
    //   周三 04-01 背第一天 词1-50（今天04-05，已过2天复习期，列入待复习）
    //   周六 04-04 背第二天 词51-100（下次复习 04-06，明天）
    const day1Date = '2026-04-01';  // 周三
    const day2Date = '2026-04-04';  // 周六

    // 艾宾浩斯间隔: level1 = 2天
    const day1Next = '2026-04-03';  // 04-01 + 2天 → 已过期，今日待复习
    const day2Next = '2026-04-06';  // 04-04 + 2天 → 明天复习

    const lucianData = {};
    allWords.slice(0, 50).forEach(w => {
        lucianData[w.word] = { word: w.word, meaning: w.meaning || '', subject: 'en',
            level: 1, nextReviewDate: day1Next, lastReviewDate: day1Date, mistakes: 0 };
    });
    allWords.slice(50, 100).forEach(w => {
        lucianData[w.word] = { word: w.word, meaning: w.meaning || '', subject: 'en',
            level: 1, nextReviewDate: day2Next, lastReviewDate: day2Date, mistakes: 0 };
    });

    const targets = [
        { userId: 6, username: 'lucian', data: lucianData },
        { userId: 0, username: '教师', data: {} },
    ];

    let done = 0;
    targets.forEach(({ userId, username, data }) => {
        db.run(
            'INSERT OR REPLACE INTO ebbinghaus (user_id, data, updated_at) VALUES (?, ?, ?)',
            [userId, JSON.stringify(data), new Date().toISOString()],
            err => {
                if (err) console.error(`${username} 更新失败:`, err);
                else {
                    const keys = Object.keys(data).length;
                    console.log(`${username} (user_id=${userId}) → ${keys} 词已恢复`);
                }
                if (++done === targets.length) db.close();
            }
        );
    });
});
