const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.argv[2] || path.join(__dirname, 'data.db');
const VOCAB_PATH = path.join(__dirname, 'vocabulary_final.json');

function buildCanonicalMap() {
    const raw = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
    const canonicalMap = new Map();

    raw.forEach((item) => {
        const word = (item.word || '').trim();
        if (word) canonicalMap.set(word.toLowerCase(), word);

        if (Array.isArray(item.transformations)) {
            item.transformations.forEach((transformation) => {
                const transWord = (transformation.word || '').trim();
                if (transWord) canonicalMap.set(transWord.toLowerCase(), transWord);
            });
        }
    });

    return canonicalMap;
}

function canonicalizeWord(word, canonicalMap) {
    const raw = String(word || '').trim();
    if (!raw) return raw;
    return canonicalMap.get(raw.toLowerCase()) || raw;
}

function runAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function allAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function fixUnits(db, canonicalMap) {
    const rows = await allAsync(db, "SELECT id, title, words FROM units WHERE subject = 'en'");
    let updatedUnits = 0;
    let updatedWords = 0;

    for (const row of rows) {
        let changed = false;
        const parsed = JSON.parse(row.words || '[]').map((entry) => {
            const next = { ...entry };
            const canonicalWord = canonicalizeWord(entry.word, canonicalMap);
            if (canonicalWord !== entry.word) {
                next.word = canonicalWord;
                changed = true;
                updatedWords += 1;
            }

            if (entry.form_change_word) {
                const canonicalForm = canonicalizeWord(entry.form_change_word, canonicalMap);
                if (canonicalForm !== entry.form_change_word) {
                    next.form_change_word = canonicalForm;
                    changed = true;
                }
            }

            if (Array.isArray(entry.transformations)) {
                next.transformations = entry.transformations.map((transformation) => {
                    const canonicalTransformationWord = canonicalizeWord(transformation.word, canonicalMap);
                    if (canonicalTransformationWord !== transformation.word) {
                        changed = true;
                    }
                    return {
                        ...transformation,
                        word: canonicalTransformationWord
                    };
                });
            }

            return next;
        });

        if (changed) {
            await runAsync(db, 'UPDATE units SET words = ? WHERE id = ?', [JSON.stringify(parsed), row.id]);
            updatedUnits += 1;
        }
    }

    return { updatedUnits, updatedWords };
}

async function fixWordDefinitions(db, canonicalMap) {
    const rows = await allAsync(db, 'SELECT word, part_of_speech, definition, example_en, example_zh, cached_at FROM word_definitions');
    let updatedRows = 0;

    for (const row of rows) {
        const canonicalWord = canonicalizeWord(row.word, canonicalMap);
        if (canonicalWord === row.word) continue;

        await runAsync(
            db,
            'INSERT OR REPLACE INTO word_definitions (word, part_of_speech, definition, example_en, example_zh, cached_at) VALUES (?, ?, ?, ?, ?, ?)',
            [canonicalWord, row.part_of_speech, row.definition, row.example_en, row.example_zh, row.cached_at]
        );
        await runAsync(db, 'DELETE FROM word_definitions WHERE word = ?', [row.word]);
        updatedRows += 1;
    }

    return updatedRows;
}

async function fixEbbinghaus(db, canonicalMap) {
    const rows = await allAsync(db, 'SELECT user_id, data FROM ebbinghaus');
    let updatedUsers = 0;
    let updatedEntries = 0;

    for (const row of rows) {
        const data = JSON.parse(row.data || '{}');
        const nextData = {};
        let changed = false;

        Object.entries(data).forEach(([key, value]) => {
            const canonicalKey = canonicalizeWord(key, canonicalMap);
            const nextValue = { ...value };

            if (nextValue.word) {
                const canonicalWord = canonicalizeWord(nextValue.word, canonicalMap);
                if (canonicalWord !== nextValue.word) {
                    nextValue.word = canonicalWord;
                    changed = true;
                }
            }

            if (canonicalKey !== key) {
                changed = true;
                updatedEntries += 1;
            }

            if (!nextData[canonicalKey]) {
                nextData[canonicalKey] = nextValue;
            } else {
                nextData[canonicalKey] = {
                    ...nextData[canonicalKey],
                    ...nextValue,
                    word: canonicalKey,
                    mistakes: Math.max(nextData[canonicalKey].mistakes || 0, nextValue.mistakes || 0),
                    level: Math.max(nextData[canonicalKey].level || 0, nextValue.level || 0)
                };
            }
        });

        if (changed) {
            await runAsync(db, 'UPDATE ebbinghaus SET data = ? WHERE user_id = ?', [JSON.stringify(nextData), row.user_id]);
            updatedUsers += 1;
        }
    }

    return { updatedUsers, updatedEntries };
}

async function main() {
    if (!fs.existsSync(VOCAB_PATH)) {
        throw new Error(`Missing vocabulary file: ${VOCAB_PATH}`);
    }

    const canonicalMap = buildCanonicalMap();
    const db = new sqlite3.Database(DB_PATH);

    try {
        const unitResult = await fixUnits(db, canonicalMap);
        let cacheResult = 0;
        let ebbinghausResult = { updatedUsers: 0, updatedEntries: 0 };

        try {
            cacheResult = await fixWordDefinitions(db, canonicalMap);
        } catch (err) {
            if (!String(err.message || err).includes('no such table')) throw err;
        }

        try {
            ebbinghausResult = await fixEbbinghaus(db, canonicalMap);
        } catch (err) {
            if (!String(err.message || err).includes('no such table')) throw err;
        }

        console.log('Word case fix completed.');
        console.log(`Units updated: ${unitResult.updatedUnits}`);
        console.log(`Words updated in units: ${unitResult.updatedWords}`);
        console.log(`Word-definition cache rows updated: ${cacheResult}`);
        console.log(`Ebbinghaus users updated: ${ebbinghausResult.updatedUsers}`);
        console.log(`Ebbinghaus entries updated: ${ebbinghausResult.updatedEntries}`);
    } finally {
        db.close();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
