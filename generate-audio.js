const sqlite3 = require('sqlite3').verbose();
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR);
}

const db = new sqlite3.Database(path.join(__dirname, 'data.db'));

function sanitizeFilename(text) {
    return text.replace(/[\/\\?%*:|"<>]/g, '_').trim() + '.mp3';
}

async function generate() {
    const tts = new MsEdgeTTS();

    db.all('SELECT * FROM units', async (err, rows) => {
        if (err) throw err;

        const map = new Map();
        rows.forEach(row => {
            let words = [];
            try { words = JSON.parse(row.words); } catch (e) { }
            words.forEach(w => {
                if (w.word && w.word.trim()) {
                    map.set(w.word.trim(), row.subject === 'en' ? 'en' : 'zh');
                }
                if (w.meaning && w.meaning.trim()) {
                    // A simple heuristic: if it contains Chinese characters, set voice to Chinese
                    const isZh = /[\u4e00-\u9fa5]/.test(w.meaning);
                    map.set(w.meaning.trim(), isZh ? 'zh' : 'en');
                }
            });
        });

        console.log(`Found ${map.size} unique phrases to generate.`);
        let count = 0;

        for (const [text, lang] of map.entries()) {
            const filename = sanitizeFilename(text);
            const filepath = path.join(AUDIO_DIR, filename);

            if (fs.existsSync(filepath)) {
                console.log(`[Skipping] ${text} -> ${filename} (Already exists)`);
                continue;
            }

            console.log(`[Generating] ${text} -> ${filename} (${lang})`);
            try {
                // 'en-US-AriaNeural' acts as a clear and natural English female voice
                // 'zh-CN-XiaoxiaoNeural' acts as a clear and natural Chinese female voice
                const voice = lang === 'en' ? 'en-US-AriaNeural' : 'zh-CN-XiaoxiaoNeural';
                await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

                await tts.toFile(filepath, text);
                count++;

                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
                console.error(`Failed to generate: ${text}`, e);
            }
        }

        console.log(`\nAll done! Successfully generated ${count} new audio files.`);
    });
}

generate();
