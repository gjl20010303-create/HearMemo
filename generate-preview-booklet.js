const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data.db');
const VOCAB_PATH = path.join(__dirname, 'vocabulary_final.json');
const OUTPUT_PATH = path.join(__dirname, 'grade9-preview-booklet.html');
const WORDS_PER_DAY = 20;
const DAYS_PER_PAGE = 4;

const canonicalWordMap = new Map();
if (fs.existsSync(VOCAB_PATH)) {
    try {
        const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
        vocab.forEach((item) => {
            const word = (item.word || '').trim();
            if (word) canonicalWordMap.set(word.toLowerCase(), word);
            if (Array.isArray(item.transformations)) {
                item.transformations.forEach((transformation) => {
                    const transWord = (transformation.word || '').trim();
                    if (transWord) canonicalWordMap.set(transWord.toLowerCase(), transWord);
                });
            }
        });
    } catch (err) {
        console.error('Failed to load canonical case map:', err.message);
    }
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function chunk(array, size) {
    const result = [];
    for (let index = 0; index < array.length; index += size) {
        result.push(array.slice(index, index + size));
    }
    return result;
}

function getGrade9Words() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (openErr) => {
            if (openErr) reject(openErr);
        });

        db.all(
            "SELECT title, words FROM units WHERE grade = '9' AND subject = 'en' ORDER BY id ASC",
            [],
            (err, rows) => {
                if (err) {
                    db.close();
                    reject(err);
                    return;
                }

                const words = [];
                rows.forEach((row) => {
                    try {
                        const parsed = JSON.parse(row.words || '[]');
                        parsed.forEach((entry) => {
                            if (!entry || !entry.word) return;
                            const rawWord = entry.word || '';
                            const canonicalWord = canonicalWordMap.get(String(rawWord).toLowerCase()) || rawWord;
                            words.push({
                                word: canonicalWord,
                                pronunciation: entry.pronunciation || '',
                                partOfSpeech: entry.part_of_speech || '',
                                unitTitle: row.title || ''
                            });
                        });
                    } catch (parseErr) {
                        console.error(`Failed to parse unit ${row.title}:`, parseErr.message);
                    }
                });

                db.close((closeErr) => {
                    if (closeErr) {
                        reject(closeErr);
                        return;
                    }
                    resolve(words);
                });
            }
        );
    });
}

function renderWordItem(entry, index) {
    return `
        <li class="word-item">
            <span class="word-index">${index + 1}</span>
            <div class="word-main">
                <div class="word-text">${escapeHtml(entry.word)}</div>
                <div class="word-meta">${escapeHtml(entry.partOfSpeech)}${entry.pronunciation ? `  ${escapeHtml(entry.pronunciation)}` : ''}</div>
            </div>
        </li>
    `;
}

function renderDayCard(words, dayIndex) {
    const columns = chunk(words, 10);
    const dayNumber = dayIndex + 1;
    const unitNames = [...new Set(words.map((item) => item.unitTitle).filter(Boolean))];
    const unitLabel = unitNames.length > 0 ? unitNames.join(' / ') : '九年级词书';

    return `
        <section class="day-card">
            <div class="day-card-header">
                <div>
                    <div class="day-title">Day ${dayNumber}</div>
                    <div class="day-subtitle">${escapeHtml(unitLabel)}</div>
                </div>
                <div class="day-count">${words.length} words</div>
            </div>

            <div class="word-columns ${columns.length === 1 ? 'single-column' : ''}">
                ${columns.map((column) => `
                    <ol class="word-list">
                        ${column.map((entry, index) => renderWordItem(entry, index + (column === columns[1] ? 10 : 0))).join('')}
                    </ol>
                `).join('')}
            </div>

            <div class="notes-box">
                <div class="notes-title">课堂笔记区：词根词缀 / 核心义 / 易错点</div>
                <div class="notes-lines">
                    <div class="notes-line"></div>
                    <div class="notes-line"></div>
                    <div class="notes-line"></div>
                </div>
            </div>
        </section>
    `;
}

function renderHtml(words) {
    const dayGroups = chunk(words, WORDS_PER_DAY);
    const pages = chunk(dayGroups, DAYS_PER_PAGE);
    const today = new Date().toISOString().slice(0, 10);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grade 9 Preview Booklet</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 12mm;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            background: #e8edf2;
            color: #1f2937;
        }

        .page {
            width: 297mm;
            min-height: 210mm;
            padding: 12mm;
            margin: 0 auto 10mm;
            background: #ffffff;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6mm;
            page-break-after: always;
        }

        .page:last-child {
            page-break-after: auto;
        }

        .cover {
            grid-template-columns: 1fr;
            align-content: start;
            gap: 8mm;
        }

        .days-page {
            grid-template-rows: 1fr 1fr;
        }

        .cover-card {
            border: 1px solid #d1d5db;
            border-radius: 6mm;
            padding: 10mm;
            background: linear-gradient(180deg, #fafaf9 0%, #ffffff 100%);
        }

        .cover-title {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin-bottom: 4mm;
        }

        .cover-subtitle {
            font-size: 14px;
            color: #4b5563;
            margin-bottom: 6mm;
        }

        .cover-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 4mm;
            margin-top: 8mm;
        }

        .cover-stat {
            border: 1px solid #e5e7eb;
            border-radius: 4mm;
            padding: 4mm;
            background: #f9fafb;
        }

        .cover-stat strong {
            display: block;
            font-size: 20px;
            margin-bottom: 2mm;
        }

        .cover-notes {
            margin-top: 8mm;
        }

        .cover-line {
            height: 11mm;
            border-bottom: 1px dashed #cbd5e1;
        }

        .day-card {
            border: 1px solid #d1d5db;
            border-radius: 6mm;
            padding: 5mm;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .day-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 4mm;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 2.5mm;
            margin-bottom: 2.5mm;
        }

        .day-title {
            font-size: 17px;
            font-weight: 700;
        }

        .day-subtitle {
            font-size: 10px;
            color: #6b7280;
            margin-top: 0.8mm;
        }

        .day-count {
            font-size: 10px;
            color: #374151;
            padding: 1.5mm 3mm;
            border: 1px solid #d1d5db;
            border-radius: 999px;
            white-space: nowrap;
        }

        .word-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin-bottom: 3mm;
        }

        .word-columns.single-column {
            grid-template-columns: 1fr;
        }

        .word-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        .word-item {
            display: grid;
            grid-template-columns: 5mm 1fr;
            gap: 2mm;
            align-items: start;
            padding: 0.9mm 0;
            border-bottom: 1px dotted #e5e7eb;
            min-height: 7.5mm;
        }

        .word-index {
            font-size: 9px;
            color: #6b7280;
            line-height: 1.4;
            padding-top: 0.3mm;
        }

        .word-text {
            font-size: 12px;
            font-weight: 700;
            line-height: 1.25;
        }

        .word-meta {
            font-size: 9px;
            color: #6b7280;
            line-height: 1.25;
            min-height: 3mm;
        }

        .notes-box {
            margin-top: auto;
            border: 1px solid #e5e7eb;
            border-radius: 4mm;
            padding: 3mm;
            background: #fcfcfb;
        }

        .notes-title {
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 1.5mm;
        }

        .notes-lines {
            display: grid;
            gap: 1.8mm;
        }

        .notes-line {
            border-bottom: 1px solid #d1d5db;
            height: 4.5mm;
        }

        .footer {
            position: fixed;
            bottom: 5mm;
            right: 10mm;
            font-size: 10px;
            color: #94a3b8;
        }

        @media print {
            body {
                background: #ffffff;
            }

            .page {
                margin: 0;
                width: auto;
                min-height: auto;
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <section class="page cover">
        <div class="cover-card">
            <div class="cover-title">九年级英语预习打印册</div>
            <div class="cover-subtitle">按每日 20 词编排，方便带学生做课前预习、词根词缀扩展和随堂笔记。打印时间：${today}</div>

            <div class="cover-grid">
                <div class="cover-stat">
                    <strong>${words.length}</strong>
                    <span>总词数</span>
                </div>
                <div class="cover-stat">
                    <strong>${dayGroups.length}</strong>
                    <span>总天数</span>
                </div>
                <div class="cover-stat">
                    <strong>${WORDS_PER_DAY}</strong>
                    <span>每日词数</span>
                </div>
            </div>

            <div class="cover-notes">
                <div style="font-weight:700; margin-bottom:2mm;">使用建议</div>
                <div style="font-size:13px; color:#4b5563; line-height:1.7;">每个 Day 保留了独立课堂笔记区。建议先预习英文拼写，再在课堂里补充词性、核心义、词根词缀、同根词和易错点。</div>
                <div class="cover-line"></div>
                <div class="cover-line"></div>
                <div class="cover-line"></div>
            </div>
        </div>
    </section>

    ${pages.map((pageDays) => `
        <section class="page days-page">
            ${pageDays.map((dayWords, dayOffset) => renderDayCard(dayWords, pages.indexOf(pageDays) * DAYS_PER_PAGE + dayOffset)).join('')}
        </section>
    `).join('')}

    <div class="footer">HearMemo Grade 9 Preview Booklet</div>
</body>
</html>`;
}

async function main() {
    const words = await getGrade9Words();
    if (words.length === 0) {
        throw new Error('No grade 9 English words found in data.db');
    }

    const html = renderHtml(words);
    fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
    console.log(`Generated ${OUTPUT_PATH} with ${words.length} words.`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});