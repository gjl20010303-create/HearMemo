/**
 * 语音发音模块
 * 使用 sessionId 机制，彻底解决 stop() 后异步音频仍播放的 Bug
 */
class AudioController {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.englishVoice = null;
        this.chineseVoice = null;

        // sessionId: 每次 stop() 时自增，让所有旧的异步回调知道自己已过期，不再发音
        this.sessionId = 0;

        // 缓存单一 audio 实例
        this.audioPlayer = new Audio();

        this.initVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = this.initVoices.bind(this);
        }
    }

    initVoices() {
        this.voices = this.synth.getVoices();
        if (this.voices.length > 0) {
            this.englishVoice =
                this.voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) ||
                this.voices.find(v => v.lang.includes('en-US')) ||
                this.voices.find(v => v.lang.includes('en-GB'));
            this.chineseVoice =
                this.voices.find(v => v.lang.includes('zh-CN')) ||
                this.voices.find(v => v.lang.includes('zh'));
        }
    }

    /**
     * 立即停止所有当前及即将发出的声音。
     * 通过递增 sessionId，使所有正在进行的异步播放回调失效。
     */
    stop() {
        // 递增 session，使所有挂起的异步回调失效
        this.sessionId++;

        // 立即停止 HTML Audio 元素
        this.audioPlayer.pause();
        this.audioPlayer.removeAttribute('src');
        this.audioPlayer.load();

        // 立即停止 Web Speech API
        if (this.synth.speaking || this.synth.pending) {
            this.synth.cancel();
        }
    }

    /**
     * 核心发音函数。用 capturedSession 快照当前 session ID。
     * 一旦 stop() 被调用，sessionId 会变，所有回调里的 capturedSession 就会过期，从而拒绝播放。
     */
    speak(text, isEnglish = true) {
        if (!text || text.trim() === '') return;

        // 快照当前 session ID
        const capturedSession = this.sessionId;

        const lang = isEnglish ? 'en' : 'zh';
        const encodedText = encodeURIComponent(text);
        const apiUrl = `/api/tts?text=${encodedText}&lang=${lang}&_t=${Date.now()}`;

        this.audioPlayer.src = apiUrl;

        this.audioPlayer.play().catch(() => {
            // 如果 session 已过期（stop() 被调用过），则放弃回退
            if (this.sessionId !== capturedSession) return;

            // 回退到有道在线 TTS
            const type = isEnglish ? 2 : 0;
            const youdaoUrl = `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodedText}`;
            this.audioPlayer.src = youdaoUrl;

            this.audioPlayer.play().catch(() => {
                // Session 再次检查
                if (this.sessionId !== capturedSession) return;
                this.fallbackSpeak(text, isEnglish, capturedSession);
            });
        });
    }

    fallbackSpeak(text, isEnglish, capturedSession) {
        // Session 检查：如果已过期则跳过
        if (this.sessionId !== capturedSession) return;

        if (this.synth.speaking) this.synth.cancel();

        const utterThis = new SpeechSynthesisUtterance(text);
        if (isEnglish && this.englishVoice) {
            utterThis.voice = this.englishVoice;
            utterThis.lang = 'en-US';
        } else if (!isEnglish && this.chineseVoice) {
            utterThis.voice = this.chineseVoice;
            utterThis.lang = 'zh-CN';
        }
        utterThis.rate = 0.85;
        this.synth.speak(utterThis);
    }

    unlockAudio() {
        // 静音播放解锁浏览器音频权限
        const silentAudio = new Audio();
        silentAudio.play().catch(() => { });
        const utterThis = new SpeechSynthesisUtterance('');
        utterThis.volume = 0;
        this.synth.speak(utterThis);
    }
}

window.audioController = new AudioController();
