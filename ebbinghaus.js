/**
 * 艾宾浩斯记忆法核心逻辑
 * 记忆间隔：1天, 2天, 4天, 7天, 15天
 */
class EbbinghausManager {
    constructor() {
        this.STORAGE_KEY = 'hearmemo_ebbinghaus_data';
        /*
          data format:
          {
             "word1": { word: "apple", meaning: "苹果", level: 0, nextReviewDate: "2023-10-01", lastReviewDate: "...", mistakes: 1 },
             ...
          }
        */
        this.data = this.loadData();
        this.intervals = [1, 2, 4, 7, 15]; // 天数
    }

    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    }

    saveData() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    // 添加或更新错题
    addOrUpdateMistake(word, meaning = '', subject = 'en') {
        const now = new Date();
        const todayStr = this.formatDate(now);

        if (this.data[word]) {
            // 已存在，重置级别或保持当前级别但增加错误次数
            this.data[word].level = 0; // 只要写错就重置到第一级
            this.data[word].mistakes += 1;
            this.data[word].nextReviewDate = this.calculateNextDate(todayStr, 0);
            this.data[word].meaning = meaning || this.data[word].meaning;
            this.data[word].subject = subject;
        } else {
            // 新错题
            this.data[word] = {
                word: word,
                meaning: meaning,
                subject: subject,
                level: 0,
                nextReviewDate: this.calculateNextDate(todayStr, 0),
                lastReviewDate: todayStr,
                mistakes: 1
            };
        }
        this.saveData();
    }

    // 标记一个词复习成功
    markReviewSuccess(word) {
        if (!this.data[word]) return;

        const record = this.data[word];
        const now = new Date();
        const todayStr = this.formatDate(now);

        record.level += 1;
        record.lastReviewDate = todayStr;

        if (record.level >= this.intervals.length) {
            // 完全掌握，可设定一个特殊的极大值日期，或者标记为 mastered
            record.nextReviewDate = '2099-12-31';
        } else {
            record.nextReviewDate = this.calculateNextDate(todayStr, record.level);
        }

        this.saveData();
    }

    // 标记一个词复习失败
    markReviewFail(word) {
        if (!this.data[word]) return;
        this.data[word].level = 0; // 打回原形
        this.data[word].mistakes += 1;
        this.data[word].nextReviewDate = this.calculateNextDate(this.formatDate(new Date()), 0);
        this.saveData();
    }

    // 获取今天需要复习的词
    getTodayReviewList() {
        const todayStr = this.formatDate(new Date());
        const reviewList = [];

        for (const key in this.data) {
            const record = this.data[key];
            if (record.nextReviewDate <= todayStr && record.nextReviewDate !== '2099-12-31') {
                reviewList.push(record);
            }
        }

        return reviewList;
    }

    // 获取所有错题/已掌握统计
    getStats() {
        let totalMistakes = 0;
        let mastered = 0;
        let todayReview = this.getTodayReviewList().length;

        for (const key in this.data) {
            totalMistakes++;
            if (this.data[key].nextReviewDate === '2099-12-31') {
                mastered++;
            }
        }

        return { totalMistakes, mastered, todayReview, allRecords: Object.values(this.data) };
    }

    // 工具函数：计算下一次复习日期
    calculateNextDate(baseDateStr, level) {
        const date = new Date(baseDateStr);
        const addDays = this.intervals[level] || 1;
        date.setDate(date.getDate() + addDays);
        return this.formatDate(date);
    }

    // 工具函数：格式化日期为 YYYY-MM-DD
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}

// Global instance
window.ebbinghaus = new EbbinghausManager();
