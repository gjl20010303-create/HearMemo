/**
 * 核心业务逻辑与界面控制 (App.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let units = {};
    let currentDictationList = [];
    let currentIndex = 0;
    let currentDictationTitle = '';
    let currentSubject = 'en'; // 学科
    let isReviewMode = false; // 是否为艾宾浩斯复习模式
    let adminKey = ''; // 管理员密钥

    let dictationStats = { correct: 0, error: 0, mistakes: [] };

    // ---- DOM Elements ----
    const pages = document.querySelectorAll('.page');
    const navLinks = document.querySelectorAll('.nav-links li');

    // Page: Home EN & ZH
    const unitGridEn = document.getElementById('unit-grid-en');
    const unitGridZh = document.getElementById('unit-grid-zh');

    // Page: Dictation & Grading
    const btnExitDictation = document.getElementById('btn-exit-dictation');
    const dictationTitle = document.getElementById('current-dictation-title');
    const progressBar = document.getElementById('dictation-progress');
    const elCurrentIdx = document.getElementById('current-word-index');
    const elTotalIdx = document.getElementById('total-word-count');
    const btnPlayWord = document.getElementById('btn-play-word');
    const btnNextWord = document.getElementById('btn-next-word');
    const btnPrevWord = document.getElementById('btn-prev-word');
    const gradingList = document.getElementById('grading-list');
    const btnSubmitGrades = document.getElementById('btn-submit-grades');

    // Page: Ebbinghaus
    const todayReviewCount = document.getElementById('today-review-count');
    const totalMastered = document.getElementById('total-mastered');
    const btnStartReview = document.getElementById('btn-start-review');
    const mistakeList = document.getElementById('mistake-list');

    // Page: Manage
    const editUnitSelect = document.getElementById('edit-unit-select');
    const unitTitleInput = document.getElementById('unit-title-input');
    const unitWordsInput = document.getElementById('unit-words-input');
    const btnSaveUnit = document.getElementById('btn-save-unit');
    const btnClearForm = document.getElementById('btn-clear-form');
    const btnClearAllData = document.getElementById('btn-clear-all-data');

    // Modals
    const resultModal = document.getElementById('result-modal');
    const btnCloseResult = document.getElementById('btn-close-result');
    const adminModal = document.getElementById('admin-modal');
    const btnAdminLogin = document.getElementById('btn-admin-login');
    const adminPasswordInput = document.getElementById('admin-password-input');
    const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
    const btnSubmitAdmin = document.getElementById('btn-submit-admin');
    const navManage = document.getElementById('nav-manage');

    // ---- Initialization ----
    loadUnitsFromServer();
    renderEbbinghausStats();

    // ---- Navigation ----
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const pageId = link.getAttribute('data-page');
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${pageId}`).classList.add('active');

            if (pageId.startsWith('home')) renderUnitGrids();
            if (pageId === 'ebbinghaus') renderEbbinghausStats();
            if (pageId === 'manage') populateEditUnitSelect();

            // 切换页面时停止正在播放的语音
            if (window.audioController && typeof window.audioController.stop === 'function') {
                window.audioController.stop();
            }

            // 初次点击激活语音权限
            window.audioController.unlockAudio();
        });
    });

    btnAdminLogin.addEventListener('click', () => {
        adminModal.classList.add('active');
    });

    btnCloseAdminModal.addEventListener('click', () => {
        adminModal.classList.remove('active');
        adminPasswordInput.value = '';
    });

    btnSubmitAdmin.addEventListener('click', async () => {
        const inputKey = adminPasswordInput.value.trim();
        if (!inputKey) return;

        try {
            // Quickly verify the key by doing a dummy auth check or just relying on a dedicated endpoint
            const res = await fetch('/api/verify-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminKey: inputKey })
            });

            if (res.ok) {
                adminKey = inputKey;
                navManage.style.display = 'flex';
                adminModal.classList.remove('active');
                alert('已进入教师管理模式！');
                btnAdminLogin.style.display = 'none';
            } else {
                alert('密码错误！请求被拒绝。');
            }
        } catch (e) {
            alert('网络错误，无法验证密码。');
        }
    });

    // ---- Unit Management (Server Communication) ----
    async function loadUnitsFromServer() {
        try {
            const response = await fetch('/api/units');
            if (!response.ok) throw new Error('网络请求失败');
            const data = await response.json();
            units = data;
        } catch (error) {
            console.error('加载单元失败', error);
            // Fallback gracefully handling if backend not running (e.g local index.html directly)
            units = {
                '后端连线失败 (仅演示)': {
                    subject: 'en', words: [{ word: 'offline', meaning: '离线' }]
                }
            };
        }
        renderUnitGrids();
        populateEditUnitSelect();
    }

    btnSaveUnit.addEventListener('click', async () => {
        const title = unitTitleInput.value.trim();
        const wordsText = unitWordsInput.value.trim();

        if (!title || !wordsText) {
            alert('名称及词汇列表不能为空！');
            return;
        }

        const lines = wordsText.split('\n');
        const parsedWords = [];
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            // 支持 apple=苹果 格式
            const parts = line.split('=');
            parsedWords.push({
                word: parts[0].trim().toLowerCase(),
                meaning: parts[1] ? parts[1].trim() : ''
            });
        });

        if (parsedWords.length > 0) {
            const subjectEl = document.querySelector('input[name="unit-subject"]:checked');
            const subjectVal = subjectEl ? subjectEl.value : 'en';

            try {
                const res = await fetch('/api/units', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        adminKey: adminKey,
                        title: title,
                        subject: subjectVal,
                        words: parsedWords
                    })
                });

                if (!res.ok) {
                    const errObj = await res.json();
                    alert(`保存失败: ${errObj.error}`);
                    return;
                }

                // Refresh data from server
                await loadUnitsFromServer();

                alert(`成功保存单元 ${title}，包含 ${parsedWords.length} 个单词。`);
                unitTitleInput.value = '';
                unitWordsInput.value = '';

                if (subjectVal === 'en') {
                    navLinks[0].click(); // 跳回英语
                } else {
                    navLinks[1].click(); // 跳回语文
                }
            } catch (err) {
                alert('网络请求出错: ' + err.message);
            }
        }
    });

    editUnitSelect.addEventListener('change', (e) => {
        const title = e.target.value;
        if (!title) {
            unitTitleInput.value = '';
            unitWordsInput.value = '';
            return;
        }
        const unitContent = units[title];
        const isArray = Array.isArray(unitContent);
        const wordList = isArray ? unitContent : unitContent.words;
        const subject = isArray ? 'en' : (unitContent.subject || 'en');

        unitTitleInput.value = title;
        const radio = document.querySelector(`input[name="unit-subject"][value="${subject}"]`);
        if (radio) radio.checked = true;

        unitWordsInput.value = wordList.map(w => w.meaning ? `${w.word}=${w.meaning}` : w.word).join('\n');
    });

    btnClearForm.addEventListener('click', () => {
        editUnitSelect.value = '';
        unitTitleInput.value = '';
        unitWordsInput.value = '';
    });

    btnClearAllData.addEventListener('click', () => {
        if (confirm('警告：这将会清除所有的听写单元、错题本和复习计划。确定吗？')) {
            localStorage.clear();
            location.reload();
        }
    });

    // ---- Edit Unit Dropdown ----
    function populateEditUnitSelect() {
        editUnitSelect.innerHTML = '<option value="">-- 创建新单元 --</option>';
        Object.keys(units).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            editUnitSelect.appendChild(option);
        });
    }

    // ---- Home / Unit Grids ----
    function renderUnitGrids() {
        unitGridEn.innerHTML = '';
        unitGridZh.innerHTML = '';
        const keys = Object.keys(units);

        let countEn = 0;
        let countZh = 0;

        keys.forEach(key => {
            const unitObj = units[key];
            const isArray = Array.isArray(unitObj);
            const wordList = isArray ? unitObj : unitObj.words;
            const subject = isArray ? 'en' : (unitObj.subject || 'en');

            const card = document.createElement('div');
            card.className = 'unit-card blur-card';
            card.innerHTML = `
                <div class="unit-title">${key}</div>
                <div class="unit-meta">
                    <span>${wordList.length} 词</span>
                    <span><i class="ri-play-circle-line"></i> 点击听写</span>
                </div>
            `;
            card.addEventListener('click', () => {
                startDictation(key, wordList, false, subject);
            });

            if (subject === 'en') {
                unitGridEn.appendChild(card);
                countEn++;
            } else {
                unitGridZh.appendChild(card);
                countZh++;
            }
        });

        if (countEn === 0) {
            unitGridEn.innerHTML = '<div class="empty-state">暂无英语单元。请前往“词库管理”添加。</div>';
        }
        if (countZh === 0) {
            unitGridZh.innerHTML = '<div class="empty-state">暂无语文单元。请前往“词库管理”添加。</div>';
        }
    }

    // ---- Ebbinghaus Stats ----
    function renderEbbinghausStats() {
        const stats = window.ebbinghaus.getStats();
        const reviews = window.ebbinghaus.getTodayReviewList();

        todayReviewCount.innerText = reviews.length;
        totalMastered.innerText = stats.mastered;

        btnStartReview.disabled = reviews.length === 0;

        mistakeList.innerHTML = '';
        stats.allRecords.forEach(record => {
            if (record.nextReviewDate === '2099-12-31') return; // 略过已掌握的

            const div = document.createElement('div');
            div.className = `p-3 mb-2 rounded border border-gray-700 bg-gray-800 ${record.nextReviewDate <= window.ebbinghaus.formatDate(new Date()) ? 'border-indigo-500' : ''}`;
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.borderRadius = '12px';
            div.style.padding = '16px';
            div.style.marginBottom = '12px';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="color:${record.subject === 'zh' ? '#f9a8d4' : '#a5b4fc'}">[${record.subject === 'zh' ? '幼/语' : '英'}]</strong>
                        <strong>${record.word}</strong> <span style="color:#94a3b8; font-size:14px; margin-left:8px;">${record.meaning}</span>
                    </div>
                    <div style="font-size:12px; color:#ec4899;">
                        错 ${record.mistakes} 次 | 下次复习: ${record.nextReviewDate}
                    </div>
                </div>
            `;
            mistakeList.appendChild(div);
        });
    }

    btnStartReview.addEventListener('click', () => {
        const reviews = window.ebbinghaus.getTodayReviewList();
        if (reviews.length > 0) {
            // 复习时，subject 会混合，通过 startDictation 特殊处理或传 fallback
            startDictation('今日错题复习', reviews, true, 'mixed');
        }
    });

    // ---- Dictation Logic ----
    function startDictation(title, wordList, isReview, subject = 'en') {
        if (!wordList || wordList.length === 0) return;

        currentDictationTitle = title;
        currentDictationList = [...wordList]; // 复制一份防篡改
        currentIndex = 0;
        isReviewMode = isReview;
        currentSubject = subject; // mixed if review

        dictationStats = { correct: 0, error: 0, mistakes: [] };

        // 导航到听写页面
        navLinks.forEach(l => l.classList.remove('active'));
        navLinks[1].classList.add('active'); // 选中听写模式tab
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('page-dictation').classList.add('active');

        dictationTitle.innerText = `正在听写: ${title}`;
        elTotalIdx.innerText = wordList.length;

        loadCurrentWord();
    }

    function loadCurrentWord() {
        const wordObj = currentDictationList[currentIndex];

        elCurrentIdx.innerText = currentIndex + 1;
        progressBar.style.width = `${(currentIndex / currentDictationList.length) * 100}%`;

        btnPrevWord.style.display = currentIndex > 0 ? 'inline-flex' : 'none';

        if (currentIndex === currentDictationList.length - 1) {
            btnNextWord.innerHTML = '完成听写 <i class="ri-check-line"></i>';
            btnNextWord.classList.replace('secondary', 'primary');
        } else {
            btnNextWord.innerHTML = '下一个词 <i class="ri-arrow-right-s-line"></i>';
            btnNextWord.classList.replace('primary', 'secondary');
        }

        // 自动发音 (轻微延迟保证体验)
        setTimeout(() => {
            playCurrentWord();
        }, 300);
    }

    function playCurrentWord() {
        const wordObj = currentDictationList[currentIndex];
        // 如果是复习模式（mixed），从错题对象里取 subject，否则用当前单元的 subject
        const wordSubject = (isReviewMode && wordObj.subject) ? wordObj.subject : currentSubject;

        if (wordSubject === 'en') {
            window.audioController.speak(wordObj.word, true);
            if (wordObj.meaning && wordObj.meaning.trim() !== '') {
                setTimeout(() => {
                    window.audioController.speak(wordObj.meaning, false);
                }, 1200);
            }
        } else {
            // 语文：先播放中文单词，再播放英文翻译（如有）
            window.audioController.speak(wordObj.word, false);
            if (wordObj.meaning && wordObj.meaning.trim() !== '') {
                setTimeout(() => {
                    window.audioController.speak(wordObj.meaning, true);
                }, 1200);
            }
        }
    }

    btnPlayWord.addEventListener('click', playCurrentWord);

    btnPrevWord.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            loadCurrentWord();
        }
    });

    btnNextWord.addEventListener('click', () => {
        currentIndex++;
        progressBar.style.width = `${(currentIndex / currentDictationList.length) * 100}%`;
        if (currentIndex >= currentDictationList.length) {
            finishDictationAndGrade();
        } else {
            loadCurrentWord();
        }
    });

    function finishDictationAndGrade() {
        // 跳转到批改页面
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('page-grading').classList.add('active');

        gradingList.innerHTML = '';
        currentDictationList.forEach((wordObj, idx) => {
            const div = document.createElement('div');
            div.className = 'p-3 mb-2 rounded border border-gray-700 bg-gray-800 flex justify-between align-center grading-item';
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.borderRadius = '12px';
            div.style.padding = '12px 16px';
            div.style.marginBottom = '12px';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';
            div.style.cursor = 'pointer'; // Make the whole row clickable

            div.innerHTML = `
                <div>
                    <span style="color:#94a3b8; margin-right:8px; font-size:14px;">${idx + 1}.</span>
                    <strong>${wordObj.word}</strong> <span style="color:#94a3b8; font-size:14px; margin-left:8px;">${wordObj.meaning || ''}</span>
                </div>
                <div>
                    <input type="checkbox" style="transform: scale(1.5); cursor:pointer;" class="mistake-checkbox" data-idx="${idx}">
                </div>
            `;

            // Allow clicking the row to toggle the checkbox
            div.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = div.querySelector('input[type="checkbox"]');
                    cb.checked = !cb.checked;
                }
            });

            gradingList.appendChild(div);
        });
    }

    btnSubmitGrades.addEventListener('click', () => {
        let errorCount = 0;
        const checkboxes = gradingList.querySelectorAll('.mistake-checkbox');

        checkboxes.forEach(cb => {
            const idx = parseInt(cb.getAttribute('data-idx'));
            const wordObj = currentDictationList[idx];
            const isMistake = cb.checked;

            const wordSubject = (isReviewMode && wordObj.subject) ? wordObj.subject : currentSubject;

            if (isMistake) {
                errorCount++;
                dictationStats.error++;
                dictationStats.mistakes.push(wordObj);

                // 记录到错题本
                if (isReviewMode) {
                    window.ebbinghaus.markReviewFail(wordObj.word);
                } else {
                    window.ebbinghaus.addOrUpdateMistake(wordObj.word, wordObj.meaning, wordSubject);
                }
            } else {
                dictationStats.correct++;
                if (isReviewMode) {
                    window.ebbinghaus.markReviewSuccess(wordObj.word);
                }
            }
        });

        // 提交完成，显示结果 Modal
        showResultModal();
    });

    function showResultModal() {
        document.getElementById('idx-total-finished').innerText = currentDictationList.length;
        document.getElementById('idx-correct-count').innerText = dictationStats.correct;
        document.getElementById('idx-error-count').innerText = dictationStats.error;

        const score = Math.round((dictationStats.correct / currentDictationList.length) * 100);
        document.getElementById('result-score').innerText = score;

        document.getElementById('result-title').innerText = isReviewMode ? "批改完成！(复习)" : "批改完成！";

        resultModal.classList.add('active');
        renderEbbinghausStats(); // 刷新后台状态
    }

    btnCloseResult.addEventListener('click', () => {
        resultModal.classList.remove('active');
        navLinks[0].click(); // 回到主页
    });

    btnExitDictation.addEventListener('click', () => {
        if (confirm('听写暂未完成，确定要退出吗？未完成的部分不会被记录。')) {
            navLinks[0].click();
        }
    });

});
