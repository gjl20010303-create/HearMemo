/**
 * 一次性导入脚本：将 vocabulary_final.json 导入为九年级冲刺词库
 * 用法：node import-vocab.js [db路径]
 * 默认 db 路径：./data.db
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.argv[2] || path.join(__dirname, 'data.db');
const VOCAB_PATH = path.join(__dirname, 'vocabulary_final.json');
const UNIT_TITLE = '中考核心词库';

const raw = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));

// 转换为 App 内部格式
const words = raw.map(item => {
    const wordObj = {
        word: (item.word || '').trim().toLowerCase(),
        meaning: (item.definition || '').trim()
    };

    if (!wordObj.word) return null;

    // 派生词：支持多个，全部存入 transformations；同时设置 has_form_change + 第一个用于冲刺测验
    if (item.has_form_change && Array.isArray(item.transformations) && item.transformations.length > 0) {
        wordObj.has_form_change = true;

        // 存储全部派生词，供后续扩展
        wordObj.transformations = item.transformations.map(t => ({
            word: (t.word || '').trim().toLowerCase(),
            part_of_speech: (t.part_of_speech || '').trim(),
            definition: (t.definition || '').trim()
        })).filter(t => t.word);

        // 第一个派生词用于当前冲刺测验的 form_change 步骤
        const first = wordObj.transformations[0];
        wordObj.form_change_hint = first.part_of_speech || '变形';
        wordObj.form_change_word = first.word;
    }

    // 例句
    if (item.example && item.example.trim()) {
        wordObj.sentence = item.example.trim();
    }

    return wordObj;
}).filter(Boolean);

console.log(`✅ 转换完成：${words.length} 个词`);
console.log(`   有派生词：${words.filter(w => w.has_form_change).length}`);
console.log(`   有例句：${words.filter(w => w.sentence).length}`);
console.log(`   多个派生词：${words.filter(w => w.transformations && w.transformations.length > 1).length}`);

const wordsJson = JSON.stringify(words);

const db = new sqlite3.Database(DB_PATH, err => {
    if (err) { console.error('打开数据库失败:', err.message); process.exit(1); }
});

// 如果已存在则更新，否则插入
db.get('SELECT id FROM units WHERE title = ?', [UNIT_TITLE], (err, row) => {
    if (err) { console.error(err); process.exit(1); }

    if (row) {
        db.run(
            'UPDATE units SET subject=?, grade=?, words=? WHERE title=?',
            ['en', '9', wordsJson, UNIT_TITLE],
            function(err) {
                if (err) { console.error('更新失败:', err.message); process.exit(1); }
                console.log(`✅ 已更新单元 "${UNIT_TITLE}"（${words.length} 词）到数据库 ${DB_PATH}`);
                db.close();
            }
        );
    } else {
        db.run(
            'INSERT INTO units (title, subject, grade, words) VALUES (?, ?, ?, ?)',
            [UNIT_TITLE, 'en', '9', wordsJson],
            function(err) {
                if (err) { console.error('插入失败:', err.message); process.exit(1); }
                console.log(`✅ 已插入单元 "${UNIT_TITLE}"（${words.length} 词）到数据库 ${DB_PATH}`);
                db.close();
            }
        );
    }
});
