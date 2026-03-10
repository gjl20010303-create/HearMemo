/**
 * 语音发音模块 (基于 网易有道在线真人/神经网络语音 API 与 Web Speech API 回退)
 */
class AudioController {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.englishVoice = null;
        this.chineseVoice = null;

        this.initVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = this.initVoices.bind(this);
        }

        // 缓存 audio 实例，避免重复创建引起内存泄漏
        this.audioPlayer = new Audio();
    }

    initVoices() {
        this.voices = this.synth.getVoices();
        if (this.voices.length > 0) {
            this.englishVoice = this.voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) ||
                this.voices.find(v => v.lang.includes('en-US')) ||
                this.voices.find(v => v.lang.includes('en-GB'));
            this.chineseVoice = this.voices.find(v => v.lang.includes('zh-CN')) ||
                this.voices.find(v => v.lang.includes('zh'));
        }
    }

    speak(text, isEnglish = true) {
        if (!text || text.trim() === '') return;

        // 生成与服务端一致的去特殊字符文件名
        const filename = text.replace(/[\/\\?%*:|"<>]/g, '_').trim() + '.mp3';
        const localUrl = `/audio/${encodeURIComponent(filename)}`;

        this.audioPlayer.src = localUrl;

        // 尝试播放本地音频
        this.audioPlayer.play().catch(e => {
            console.warn(`Local audio not found or blocked for "${text}", falling back to online TTS...`);
            this.speakOnline(text, isEnglish);
        });
    }

    speakOnline(text, isEnglish) {
        // 优先使用在线高品质语音接口 (有道词典真人发音/神经网络接口)
        // type 2: 美音 (English US), type 0: 中文 (Chinese)
        const type = isEnglish ? 2 : 0;
        const encodeText = encodeURIComponent(text);

        const url = `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeText}`;

        this.audioPlayer.src = url;
        this.audioPlayer.play().catch(e => {
            console.warn('Online TTS failed, falling back to local Browser TTS...', e);
            this.fallbackSpeak(text, isEnglish);
        });
    }

    fallbackSpeak(text, isEnglish) {
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        const utterThis = new SpeechSynthesisUtterance(text);
        if (isEnglish && this.englishVoice) {
            utterThis.voice = this.englishVoice;
            utterThis.lang = 'en-US';
        } else if (!isEnglish && this.chineseVoice) {
            utterThis.voice = this.chineseVoice;
            utterThis.lang = 'zh-CN';
        }
        utterThis.rate = 0.85;
        utterThis.pitch = 1;
        this.synth.speak(utterThis);
    }

    unlockAudio() {
        // 预加载静音解开浏览器对于 audio 的限制
        this.audioPlayer.play().catch(() => { });
        const utterThis = new SpeechSynthesisUtterance('');
        utterThis.volume = 0;
        this.synth.speak(utterThis);
    }

    stop() {
        if (!this.audioPlayer.paused) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
        }
        if (this.synth.speaking) {
            this.synth.cancel();
        }
    }
}

window.audioController = new AudioController();
