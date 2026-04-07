/**
 * 一次性导入脚本：将五年级 M2U2 课文翻译句子导入数据库
 * 用法：node import-grade5-m2u2.js [db路径]
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.argv[2] || path.join(__dirname, 'data.db');

// M2U2 课文句子（拆分后）：word=英文句, meaning=中文参考译文
const sentences = [
    { word: "Shall we go to see a film this afternoon? Great!", meaning: "今天下午我们去看电影怎么样？太棒了！" },
    { word: "There are three films on at City Cinema.", meaning: "城市电影院正在放映三部电影。" },
    { word: "Snow White, Little Tadpoles and Rabbit Run.", meaning: "有《白雪公主》、《小蝌蚪》和《兔子快跑》。" },
    { word: "Shall we see Little Tadpoles next time, Ben?", meaning: "本，下次我们去看《小蝌蚪》怎么样？" },
    { word: "It's on at two o'clock.", meaning: "它两点钟放映。" },
    { word: "Let's leave home at one thirty.", meaning: "我们一点半出发吧。" },
    { word: "Can I have three tickets for Snow White, please?", meaning: "请给我三张《白雪公主》的票，好吗？" },
    { word: "Two children and one adult.", meaning: "两张儿童票和一张成人票。" },
    { word: "Shall we get some drinks, Mum?", meaning: "妈妈，我们去买点饮料怎么样？" },
    { word: "But be quick.", meaning: "但是要快点。" },
    { word: "The film starts in five minutes.", meaning: "电影五分钟后开始。" }
];

const UNIT_TITLE = 'M2U2课文学习';
const SUBJECT = 'grade5-translation';
const GRADE = '5';

const wordsJson = JSON.stringify(sentences);

const db = new sqlite3.Database(DB_PATH, err => {
    if (err) { console.error('打开数据库失败:', err.message); process.exit(1); }
});

db.serialize(() => {
    // Ensure units table exists with grade column
    db.run(`CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT UNIQUE,
        subject TEXT,
        grade TEXT DEFAULT 'all',
        words TEXT
    )`);

    db.get('SELECT id FROM units WHERE title = ?', [UNIT_TITLE], (err, row) => {
        if (err) { console.error('查询失败:', err.message); return; }

        if (row) {
            db.run(
                'UPDATE units SET subject = ?, grade = ?, words = ? WHERE title = ?',
                [SUBJECT, GRADE, wordsJson, UNIT_TITLE],
                function(err) {
                    if (err) { console.error('更新失败:', err.message); return; }
                    console.log(`✅ 已更新单元 "${UNIT_TITLE}"，共 ${sentences.length} 句。`);
                    db.close();
                }
            );
        } else {
            db.run(
                'INSERT INTO units (title, subject, grade, words) VALUES (?, ?, ?, ?)',
                [UNIT_TITLE, SUBJECT, GRADE, wordsJson],
                function(err) {
                    if (err) { console.error('插入失败:', err.message); return; }
                    console.log(`✅ 已创建单元 "${UNIT_TITLE}"，共 ${sentences.length} 句，grade=${GRADE}，subject=${SUBJECT}。`);
                    db.close();
                }
            );
        }
    });
});
