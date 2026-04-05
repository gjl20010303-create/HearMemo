/**
 * 艾宾浩斯记忆法核心逻辑
 * 记忆间隔：1天, 2天, 4天, 7天, 15天
 * 数据云端同步：优先读取服务器，localStorage 作为备份
 */
class EbbinghausManager {
    constructor() {
        this.STORAGE_KEY = 'hearmemo_ebbinghaus_data';
        this.data = this.loadData();
        this.intervals = [1, 2, 4, 7, 15];
        this._authToken = '';
        this._saveTimer = null;
    }

    // ---- Auth ----
    setAuthToken(token) {
        this._authToken = token;
    }

    // ---- 云端同步：初始化时从服务器加载 ----
    async loadFromServer() {
        if (!this._authToken) return;
        try {
            const res = await fetch('/api/ebbinghaus', {
                headers: { 'Authorization': `Bearer ${this._authToken}` }
            });
            if (res.status === 404) {
                // 服务器没有记录 → 把本地数据迁移上去（首次登录 / 新浏览器迁移）
                const localData = this.loadData();
                if (Object.keys(localData).length > 0) {
                    this.data = localData;
                    await this._saveToServer();
                }
                return;
            }
            if (!res.ok) return;
            const json = await res.json();
            // 服务器有记录（包括空 {}）→ 以服务器为准，不再读 localStorage
            this.data = json.data || {};
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Ebbinghaus: 服务器加载失败，使用本地数据', e);
        }
    }

    // ---- 本地读取 ----
    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    }

    // ---- 保存：本地 + 延迟同步云端 ----
    saveData() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._saveToServer(), 800);
    }

    async _saveToServer() {
        if (!this._authToken) return;
        try {
            await fetch('/api/ebbinghaus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._authToken}`
                },
                body: JSON.stringify({ data: this.data })
            });
        } catch (e) {
            console.warn('Ebbinghaus: 云端保存失败', e);
        }
    }

    // 添加或更新错题
    addOrUpdateMistake(word, meaning = '', subject = 'en') {
        const now = new Date();
        const todayStr = this.formatDate(now);

        if (this.data[word]) {
            this.data[word].level = 0;
            this.data[word].mistakes += 1;
            this.data[word].nextReviewDate = this.calculateNextDate(todayStr, 0);
            this.data[word].meaning = meaning || this.data[word].meaning;
            this.data[word].subject = subject;
        } else {
            this.data[word] = {
                word, meaning, subject,
                level: 0,
                nextReviewDate: this.calculateNextDate(todayStr, 0),
                lastReviewDate: todayStr,
                mistakes: 1
            };
        }
        this.saveData();
    }

    // 标记复习成功
    markReviewSuccess(word) {
        if (!this.data[word]) return;
        const record = this.data[word];
        const todayStr = this.formatDate(new Date());
        record.level += 1;
        record.lastReviewDate = todayStr;
        record.nextReviewDate = record.level >= this.intervals.length
            ? '2099-12-31'
            : this.calculateNextDate(todayStr, record.level);
        this.saveData();
    }

    // 标记复习失败
    markReviewFail(word) {
        if (!this.data[word]) return;
        this.data[word].level = 0;
        this.data[word].mistakes += 1;
        this.data[word].nextReviewDate = this.calculateNextDate(this.formatDate(new Date()), 0);
        this.saveData();
    }

    // 获取今天需要复习的词
    getTodayReviewList() {
        const todayStr = this.formatDate(new Date());
        return Object.values(this.data).filter(
            r => r.nextReviewDate <= todayStr && r.nextReviewDate !== '2099-12-31'
        );
    }

    // 获取统计
    getStats() {
        const allRecords = Object.values(this.data);
        const mastered = allRecords.filter(r => r.nextReviewDate === '2099-12-31').length;
        return { totalMistakes: allRecords.length, mastered, todayReview: this.getTodayReviewList().length, allRecords };
    }

    calculateNextDate(baseDateStr, level) {
        const date = new Date(baseDateStr);
        date.setDate(date.getDate() + (this.intervals[level] || 1));
        return this.formatDate(date);
    }

    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}

// Global instance
window.ebbinghaus = new EbbinghausManager();
