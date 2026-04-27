/**
 * 核心业务逻辑与界面控制 (App.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let units = {};
    let currentDictationList = [];
    let currentIndex = 0;
    let currentDictationTitle = '';
    let currentSubject = 'en';
    let isReviewMode = false;
    let adminKey = '';
    let audioTimeoutId = null;
    let authToken = localStorage.getItem('hm_token') || '';
    let currentUser = null; // { username, grade }

    let dictationStats = { correct: 0, error: 0, mistakes: [] };

    // ---- DOM Elements ----
    const pages = document.querySelectorAll('.page');
    const navLinks = document.querySelectorAll('.nav-links li');
    const authWall = document.getElementById('auth-wall');
    const mainApp = document.getElementById('main-app');

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
    const unitGradeSelect = document.getElementById('unit-grade-select');
    const btnSaveUnit = document.getElementById('btn-save-unit');
    const btnDeleteUnit = document.getElementById('btn-delete-unit');
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
    const navStudents = document.getElementById('nav-students');
    const btnLogout = document.getElementById('btn-logout');

    // ---- Auth Helper ----
    function authHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        };
    }

    function showApp(user) {
        currentUser = user;
        authWall.style.display = 'none';
        mainApp.style.display = 'flex';
        const gradeLabels = { '4': '四年级', '5': '五年级', '7': '七年级', '8': '八年级', '9': '九年级', 'all': '教师(全年级)' };
        document.getElementById('user-display-name').textContent = user.username;
        document.getElementById('user-display-grade').textContent = gradeLabels[user.grade] || user.grade;
        if (user.isAdmin) {
            if (navManage) navManage.style.display = 'flex';
            if (navStudents) navStudents.style.display = 'flex';
        }

        const navHomeEn = document.getElementById('nav-home-en');
        const navHomeZh = document.getElementById('nav-home-zh');
        const navHomeSprint = document.getElementById('nav-home-sprint');
        const navNotebook = document.getElementById('nav-notebook');
        const pageHomeSprint = document.getElementById('page-home-sprint');

        if (['7', '8', '9', 'all'].includes(user.grade)) {
            // Sprint Mode: hide standard EN/ZH dictation tabs for students
            if (['7', '8', '9'].includes(user.grade)) {
                if (navHomeEn) navHomeEn.style.display = 'none';
                if (navHomeZh) navHomeZh.style.display = 'none';
            }
            if (navHomeSprint) {
                navHomeSprint.style.display = 'flex';
                navLinks.forEach(l => l.classList.remove('active'));
                navHomeSprint.classList.add('active');
            }
            if (navNotebook) navNotebook.style.display = 'flex';
            pages.forEach(p => p.classList.remove('active'));
            if (pageHomeSprint) pageHomeSprint.classList.add('active');

            // Customize sprint page text and buttons by grade
            const isLowerGrade = ['7', '8'].includes(user.grade);
            const wordCount = isLowerGrade ? 30 : 50;
            const btnSprint = document.getElementById('btn-start-sprint');
            const btnSprintReview = document.getElementById('btn-start-sprint-review');
            if (btnSprint) {
                btnSprint.innerHTML = user.grade === '9'
                    ? '<i class="ri-play-fill"></i> 背新词 50 个'
                    : `<i class="ri-play-fill"></i> 开始今日冲刺 (${wordCount}词)`;
            }
            if (btnSprintReview) {
                btnSprintReview.style.display = user.grade === '9' ? 'inline-flex' : 'none';
            }
            const descEl = document.getElementById('sprint-desc-text');
            if (descEl) {
                descEl.textContent = user.grade === '9'
                    ? '新词和复习已分开：可以先背今日新词，旧词复习稍后单独完成。'
                    : '每次背 30 个单词，每周建议完成 3 次，轻松打好中考词汇基础。';
            }
        }

        loadUnitsFromServer();
        renderEbbinghausStats();
        renderSprintFrequencyNotice();
    }

    function showAuthWall() {
        mainApp.style.display = 'none';
        authWall.style.display = 'flex';
    }

    // ---- Initialization: check token ----
    async function init() {
        if (!authToken) {
            showAuthWall();
            return;
        }
        try {
            const res = await fetch('/api/me', { headers: authHeaders() });
            if (res.ok) {
                const user = await res.json();
                // Restore isAdmin flag from token payload (jwt.verify on server returns grade:'all')
                if (user.grade === 'all') user.isAdmin = true;
                window.ebbinghaus.setAuthToken(authToken);
                await window.ebbinghaus.loadFromServer();
                showApp(user);
            } else {
                localStorage.removeItem('hm_token');
                authToken = '';
                showAuthWall();
            }
        } catch (e) {
            showAuthWall();
        }
    }
    init();

    // ---- Auth Handlers ----
    document.getElementById('btn-login').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        errEl.textContent = '';

        if (!username || !password) { errEl.textContent = '请填写用户名和密码'; return; }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                authToken = data.token;
                localStorage.setItem('hm_token', authToken);
                window.ebbinghaus.setAuthToken(authToken);
                await window.ebbinghaus.loadFromServer();
                showApp({ username: data.username, grade: data.grade });
            } else {
                errEl.textContent = data.error || '登录失败';
            }
        } catch (e) {
            errEl.textContent = '网络错误，请稍后再试';
        }
    });

    document.getElementById('btn-register').addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const grade = document.getElementById('reg-grade').value;
        const errEl = document.getElementById('reg-error');
        errEl.textContent = '';

        if (!username || !password) { errEl.textContent = '请填写用户名和密码'; return; }
        if (username.length < 2) { errEl.textContent = '用户名至少2个字符'; return; }
        if (password.length < 4) { errEl.textContent = '密码至少4个字符'; return; }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, grade })
            });
            const data = await res.json();
            if (res.ok) {
                authToken = data.token;
                localStorage.setItem('hm_token', authToken);
                window.ebbinghaus.setAuthToken(authToken);
                await window.ebbinghaus.loadFromServer();
                showApp({ username: data.username, grade: data.grade });
            } else {
                errEl.textContent = data.error || '注册失败';
            }
        } catch (e) {
            errEl.textContent = '网络错误，请稍后再试';
        }
    });

    btnLogout.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            localStorage.removeItem('hm_token');
            authToken = '';
            currentUser = null;
            adminKey = '';
            if (navManage) navManage.style.display = 'none';
            if (navStudents) navStudents.style.display = 'none';
            showAuthWall();
        }
    });

    // Admin login via auth wall tab
    const btnAdminKeyLogin = document.getElementById('btn-admin-key-login');
    if (btnAdminKeyLogin) {
        btnAdminKeyLogin.addEventListener('click', async () => {
            const key = document.getElementById('admin-key-input').value.trim();
            const errEl = document.getElementById('admin-error');
            errEl.textContent = '';
            if (!key) { errEl.textContent = '请输入管理密码'; return; }

            try {
                const res = await fetch('/api/admin-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminKey: key })
                });
                const data = await res.json();
                if (res.ok) {
                    authToken = data.token;
                    adminKey = key;
                    localStorage.setItem('hm_token', authToken);
                    showApp({ username: data.username, grade: data.grade, isAdmin: true });
                } else {
                    errEl.textContent = data.error || '登录失败';
                }
            } catch (e) {
                errEl.textContent = '网络错误，请稍后再试';
            }
        });
    }

    // ---- Navigation ----
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const pageId = link.getAttribute('data-page');

            // 离开冲刺答题页时自动保存断点
            const sprintPage = document.getElementById('page-sprint-dictation');
            if (sprintPage && sprintPage.classList.contains('active') && sprintList.length > 0) {
                saveSprintCheckpoint();
            }

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${pageId}`).classList.add('active');

            if (pageId.startsWith('home')) renderUnitGrids();
            if (pageId === 'home-sprint') renderSprintFrequencyNotice();
            if (pageId === 'ebbinghaus') renderEbbinghausStats();
            if (pageId === 'manage') populateEditUnitSelect();
            if (pageId === 'notebook') renderNotebook();
            if (pageId === 'students') renderStudentProgress();

            // 切换页面时清除所有挂起的定时器并停止正在播放的语音
            if (audioTimeoutId) clearTimeout(audioTimeoutId);
            if (window.audioController && typeof window.audioController.stop === 'function') {
                window.audioController.stop();
            }

            // 仅在首次用户交互时激活语音权限，防止重复激活导致串音
            if (!window.audioUnlocked) {
                window.audioController.unlockAudio();
                window.audioUnlocked = true;
            }
        });
    });

    // Old admin modal handlers (safely guarded — elements may not exist in current HTML)
    if (btnAdminLogin) {
        btnAdminLogin.addEventListener('click', () => {
            if (adminModal) adminModal.classList.add('active');
        });
    }

    if (btnCloseAdminModal) {
        btnCloseAdminModal.addEventListener('click', () => {
            if (adminModal) adminModal.classList.remove('active');
            if (adminPasswordInput) adminPasswordInput.value = '';
        });
    }

    if (btnSubmitAdmin) {
        btnSubmitAdmin.addEventListener('click', async () => {
            if (!adminPasswordInput) return;
            const inputKey = adminPasswordInput.value.trim();
            if (!inputKey) return;

            try {
                const res = await fetch('/api/verify-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adminKey: inputKey })
                });

                if (res.ok) {
                    adminKey = inputKey;
                    if (navManage) navManage.style.display = 'flex';
                    if (navStudents) navStudents.style.display = 'flex';
                    if (adminModal) adminModal.classList.remove('active');
                    alert('已进入教师管理模式！');
                    if (btnAdminLogin) btnAdminLogin.style.display = 'none';
                } else {
                    alert('密码错误！请求被拒绝。');
                }
            } catch (e) {
                alert('网络错误，无法验证密码。');
            }
        });
    }

    // ---- Unit Management (Server Communication) ----
    async function loadUnitsFromServer() {
        try {
            const response = await fetch('/api/units', { headers: authHeaders() });
            if (!response.ok) throw new Error('网络请求失败');
            const data = await response.json();
            units = data;
        } catch (error) {
            console.error('加载单元失败', error);
            units = {};
        }
        renderUnitGrids();
        populateEditUnitSelect();
        renderSprintFrequencyNotice();
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
            // 支持 word=meaning[=hint:form] 格式
            const parts = line.split('=');
            const wordObj = {
                word: parts[0].trim(),
                meaning: parts[1] ? parts[1].trim() : ''
            };
            if (parts[2]) {
                const formParts = parts[2].split(':');
                if (formParts.length === 2) {
                    wordObj.has_form_change = true;
                    wordObj.form_change_hint = formParts[0].trim();
                    wordObj.form_change_word = formParts[1].trim();
                } else {
                    // fallback if they just typed success=成功=successful
                    wordObj.has_form_change = true;
                    wordObj.form_change_hint = '变形';
                    wordObj.form_change_word = parts[2].trim();
                }
            }
            parsedWords.push(wordObj);
        });

        if (parsedWords.length > 0) {
            const subjectEl = document.querySelector('input[name="unit-subject"]:checked');
            const subjectVal = subjectEl ? subjectEl.value : 'en';
            const gradeVal = unitGradeSelect ? unitGradeSelect.value : 'all';

            console.log('[Save] authToken:', authToken ? authToken.substring(0, 20) + '...' : 'EMPTY!');
            console.log('[Save] adminKey:', adminKey || 'EMPTY');
            console.log('[Save] Sending:', { title, subject: subjectVal, grade: gradeVal, wordCount: parsedWords.length });

            try {
                const res = await fetch('/api/units', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        title: title,
                        subject: subjectVal,
                        grade: gradeVal,
                        words: parsedWords,
                        adminKey: adminKey || undefined
                    })
                });
                console.log('[Save] Response status:', res.status);

                if (!res.ok) {
                    let errorMessage = '未知错误';
                    try {
                        const errObj = await res.json();
                        errorMessage = errObj.error || errObj.message || errorMessage;
                    } catch (e) {
                        errorMessage = await res.text() || res.statusText;
                    }
                    alert(`保存失败: ${errorMessage}`);
                    return;
                }


                // 1. 立即清空表单
                unitTitleInput.value = '';
                unitWordsInput.value = '';

                // 2. 立即同步跳回主页（消除竞态：不等待 loadUnitsFromServer 再跳）
                if (subjectVal === 'en') {
                    navLinks[0].click();
                } else {
                    navLinks[1].click();
                }

                // 3. 后台刷新词库（不 await，让它在后台静默完成）
                loadUnitsFromServer();

                // 4. 提示成功
                alert(`成功保存单元 ${title}，包含 ${parsedWords.length} 个单词。`);
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
            if (btnDeleteUnit) btnDeleteUnit.style.display = 'none';
            return;
        }
        if (btnDeleteUnit) btnDeleteUnit.style.display = 'inline-flex';
        
        const unitContent = units[title];
        const isArray = Array.isArray(unitContent);
        const wordList = isArray ? unitContent : unitContent.words;
        const subject = isArray ? 'en' : (unitContent.subject || 'en');
        const grade = isArray ? 'all' : (unitContent.grade || 'all');

        unitTitleInput.value = title;
        const radio = document.querySelector(`input[name="unit-subject"][value="${subject}"]`);
        if (radio) radio.checked = true;
        if (unitGradeSelect) unitGradeSelect.value = grade;

        unitWordsInput.value = wordList.map(w => {
            let line = w.word;
            if (w.meaning) line += '=' + w.meaning;
            if (w.has_form_change) line += '=' + (w.form_change_hint !== '变形' ? w.form_change_hint + ':' : '') + w.form_change_word;
            return line;
        }).join('\n');
    });

    btnClearForm.addEventListener('click', () => {
        editUnitSelect.value = '';
        unitTitleInput.value = '';
        unitWordsInput.value = '';
        if (btnDeleteUnit) btnDeleteUnit.style.display = 'none';
    });

    if (btnDeleteUnit) {
        btnDeleteUnit.addEventListener('click', async () => {
            const title = unitTitleInput.value.trim();
            if (!title) return;
            
            if (!confirm(`确定要彻底删除单元 [${title}] 吗？此操作不可恢复。`)) return;

            try {
                const res = await fetch(`/api/units/${encodeURIComponent(title)}`, {
                    method: 'DELETE',
                    headers: authHeaders(),
                    // body optionally if we want to pass adminKey but usually JWT is enough
                    body: JSON.stringify({ adminKey: adminKey || undefined })
                });

                if (res.ok) {
                    alert('删除成功！');
                    btnClearForm.click();
                    loadUnitsFromServer();
                } else {
                    const errObj = await res.json();
                    alert('删除失败: ' + errObj.error);
                }
            } catch (err) {
                alert('网络请求出错: ' + err.message);
            }
        });
    }

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

            if (subject === 'grade5-translation') {
                card.innerHTML = `
                    <div class="unit-title">${key}</div>
                    <div class="unit-meta">
                        <span>${wordList.length} 句 × 2</span>
                        <span><i class="ri-translate-2"></i> 点击翻译练习</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    startGrade5Translation(key, wordList);
                });
            } else {
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
            }

            if (subject === 'en' || subject === 'grade5-translation') {
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

        // 导航到听写页面 (取消所有侧边栏高亮，因为听写页面不是侧边栏的一个tab)
        navLinks.forEach(l => l.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('page-dictation').classList.add('active');

        dictationTitle.innerText = `正在听写: ${title}`;
        elTotalIdx.innerText = wordList.length;

        loadCurrentWord();
    }

    function loadCurrentWord() {
        const wordObj = currentDictationList[currentIndex];

        // Reset hint display
        const hintEl = document.getElementById('hint-display');
        if (hintEl) { hintEl.style.display = 'none'; hintEl.textContent = ''; }

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
        if (audioTimeoutId) clearTimeout(audioTimeoutId);
        if (window.audioController && typeof window.audioController.stop === 'function') {
            window.audioController.stop();
        }

        const wordObj = currentDictationList[currentIndex];
        // 如果是复习模式（mixed），从错题对象里取 subject，否则用当前单元的 subject
        const wordSubject = (isReviewMode && wordObj.subject) ? wordObj.subject : currentSubject;

        if (wordSubject === 'en') {
            window.audioController.speak(wordObj.word, true);
            if (wordObj.meaning && wordObj.meaning.trim() !== '') {
                audioTimeoutId = setTimeout(() => {
                    window.audioController.speak(wordObj.meaning, false);
                }, 1200);
            }
        } else {
            // 语文：先播放中文单词，再播放英文翻译（如有）
            window.audioController.speak(wordObj.word, false);
            if (wordObj.meaning && wordObj.meaning.trim() !== '') {
                audioTimeoutId = setTimeout(() => {
                    window.audioController.speak(wordObj.meaning, true);
                }, 1200);
            }
        }
    }

    btnPlayWord.addEventListener('click', playCurrentWord);

    // ---- AI Hint Button ----
    const btnGetHint = document.getElementById('btn-get-hint');
    const hintDisplay = document.getElementById('hint-display');

    if (btnGetHint) {
        btnGetHint.addEventListener('click', async () => {
            const wordObj = currentDictationList[currentIndex];
            if (!wordObj) return;

            btnGetHint.disabled = true;
            btnGetHint.innerHTML = '<i class="ri-loader-4-line"></i> 思考中...';
            if (hintDisplay) hintDisplay.style.display = 'none';

            try {
                const res = await fetch(`/api/hint?word=${encodeURIComponent(wordObj.word)}`);
                const data = await res.json();
                if (hintDisplay) {
                    hintDisplay.textContent = `💡 ${data.hint || '暂无提示'}`;
                    hintDisplay.style.display = 'block';
                }
            } catch (e) {
                if (hintDisplay) {
                    hintDisplay.textContent = '💡 提示获取失败';
                    hintDisplay.style.display = 'block';
                }
            }

            btnGetHint.disabled = false;
            btnGetHint.innerHTML = '<i class="ri-lightbulb-line"></i> 获取提示';
        });
    }

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

    // ---- Sprint Mode Logic (Route B) ----
    let sprintList = [];
    let sprintIndex = 0;
    let currentSprintMode = 'mixed';
    let currentWordInfo = null;    // API-fetched word info for current sprint word
    let wordInfoPromise = null;    // Pre-fetch promise, resolved before check_meaning
    
    const pageSprintDictation = document.getElementById('page-sprint-dictation');
    const sprintWordDisplay = document.getElementById('sprint-word-display');
    const btnSprintPlay = document.getElementById('btn-sprint-play');
    
    const sprintStepMeaning = document.getElementById('sprint-step-meaning');
    const sprintMeaningInput = document.getElementById('sprint-meaning-input');
    const sprintMeaningFeedback = document.getElementById('sprint-meaning-feedback');
    const btnSprintCheckMeaning = document.getElementById('btn-sprint-check-meaning');
    
    const sprintStepForm = document.getElementById('sprint-step-form');
    const sprintFormPrompt = document.getElementById('sprint-form-prompt');
    const sprintFormInput = document.getElementById('sprint-form-input');
    const sprintFormFeedback = document.getElementById('sprint-form-feedback');
    const btnSprintCheckForm = document.getElementById('btn-sprint-check-form');
    
    const btnSprintNext = document.getElementById('btn-sprint-next');
    const btnSprintDontKnow = document.getElementById('btn-sprint-dont-know');
    const btnExitSprint = document.getElementById('btn-exit-sprint-dictation');
    const btnStartSprint = document.getElementById('btn-start-sprint');
    const btnStartSprintReview = document.getElementById('btn-start-sprint-review');
    
    if (btnStartSprint) {
        btnStartSprint.addEventListener('click', () => {
            const mode = currentUser && currentUser.grade === '9' ? 'new' : 'mixed';
            startSprintSession(mode);
        });
    }

    if (btnStartSprintReview) {
        btnStartSprintReview.addEventListener('click', () => startSprintSession('review'));
    }

    async function startSprintSession(mode) {
        try {
            const isLowerGrade = currentUser && ['7', '8'].includes(currentUser.grade);
            const MAX_SPRINT = isLowerGrade ? 30 : 50;

            const cp = loadSprintCheckpoint(mode);
            if (cp && cp.index >= 0 && cp.index < cp.list.length && cp.list.length <= MAX_SPRINT) {
                const resume = confirm(`上次背到第 ${cp.index + 1} / ${cp.list.length} 词，是否从断点继续？\n\n点【确定】接着背，点【取消】重新开一批。`);
                if (resume) {
                    currentSprintMode = cp.mode;
                    sprintList = cp.list;
                    sprintIndex = cp.index;
                    showSprintDictationPage();
                    loadSprintWord();
                    return;
                }
                clearSprintCheckpoint(mode);
            } else if (cp) {
                clearSprintCheckpoint(mode);
            }

            if (isLowerGrade) {
                const sessionsThisWeek = getSessionsThisWeek();
                const todayStr = window.ebbinghaus.formatDate(new Date());
                const alreadyTodaySession = sessionsThisWeek.includes(todayStr);
                if (!alreadyTodaySession && sessionsThisWeek.length >= 3) {
                    const go = confirm(`本周已完成 ${sessionsThisWeek.length} 次背词任务，超出每周推荐的 3 次。\n\n继续也没问题，每次还是只背 30 词。点取消可以先休息一天。`);
                    if (!go) return;
                }
            }

            const grade9Words = await fetchSprintWords();
            if (grade9Words.length === 0) {
                alert('九年级词库为空！请先以老师身份在词库管理中添加"九年级(大词书)"单词。');
                return;
            }

            const allReviewItems = getGrade9ReviewItems(grade9Words);
            const reviewItems = allReviewItems.slice(0, MAX_SPRINT);
            const newWords = buildGrade9NewWordBatch(grade9Words, MAX_SPRINT);

            if (mode === 'new') {
                if (allReviewItems.length > 0) {
                    const go = confirm(`今天还有 ${allReviewItems.length} 个待复习，可以先背新词，复习稍后完成。\n\n点【确定】继续背新词，点【取消】先不开始。`);
                    if (!go) return;
                }
                sprintList = newWords;
                if (sprintList.length === 0) {
                    alert('九年级新词已全部进入记录。可以去“复习旧词”继续巩固。');
                    return;
                }
            } else if (mode === 'review') {
                sprintList = reviewItems;
                if (sprintList.length === 0) {
                    alert('今天没有到期的旧词需要复习。');
                    return;
                }
            } else {
                sprintList = buildMixedSprintBatch(reviewItems, newWords, MAX_SPRINT);
                if (sprintList.length === 0) {
                    alert('词库为空或今日已无复习/新词任务！');
                    return;
                }
            }

            currentSprintMode = mode;
            sprintIndex = 0;
            recordTodaySession();
            renderSprintFrequencyNotice();
            showSprintDictationPage();
            loadSprintWord();
        } catch (e) {
            console.error(e);
            alert('加载失败: ' + e.message);
        }
    }

    async function fetchSprintWords() {
        const resp = await fetch('/api/sprint-words', { headers: authHeaders() });
        if (!resp.ok) throw new Error('加载词库失败，请重试');
        return await resp.json();
    }

    function buildGrade9NewWordBatch(grade9Words, limit) {
        const ebData = window.ebbinghaus.data;
        return grade9Words
            .filter(w => !ebData[w.word])
            .slice(0, limit)
            .map(w => ({ ...w, __sprintMode: 'new' }));
    }

    function buildGrade9ReviewBatch(grade9Words, limit) {
        return getGrade9ReviewItems(grade9Words).slice(0, limit);
    }

    function getGrade9ReviewItems(grade9Words) {
        const grade9Map = new Map(grade9Words.map(w => [w.word, w]));
        return window.ebbinghaus.getTodayReviewList()
            .filter(item => item.subject === 'en' && grade9Map.has(item.word))
            .map(item => ({ ...grade9Map.get(item.word), ...item, ...grade9Map.get(item.word), __sprintMode: 'review' }))
            .sort(() => Math.random() - 0.5);
    }

    function buildMixedSprintBatch(reviewItems, newWords, limit) {
        const mixed = [...reviewItems];
        const needed = limit - mixed.length;
        if (needed > 0) {
            mixed.push(...newWords.slice(0, needed).map(w => ({ ...w, __sprintMode: 'new' })));
        }
        return mixed.slice(0, limit);
    }

    function showSprintDictationPage() {
        const totalEl = document.getElementById('sprint-total-idx');
        if (totalEl) totalEl.textContent = sprintList.length;
        pages.forEach(p => p.classList.remove('active'));
        if (pageSprintDictation) pageSprintDictation.classList.add('active');
    }

    function playSprintAudio() {
        if (sprintIndex < sprintList.length) {
            const text = sprintList[sprintIndex].word;
            const url = `/api/tts?text=${encodeURIComponent(text)}&lang=en&_t=${Date.now()}`;
            const audio = new Audio(url);
            audio.play().catch(e => console.error(e));
        }
    }

    if (btnSprintPlay) {
        btnSprintPlay.addEventListener('click', playSprintAudio);
    }

    function loadSprintWord() {
        if (sprintIndex >= sprintList.length) {
            clearSprintCheckpoint();
            alert('🎉 恭喜！今日冲刺完成！');
            if (document.getElementById('nav-home-sprint')) {
                document.getElementById('nav-home-sprint').click();
            }
            return;
        }

        const currentWord = sprintList[sprintIndex];
        const curIdxEl = document.getElementById('sprint-current-idx');
        if (curIdxEl) curIdxEl.textContent = sprintIndex + 1;
        
        const progEl = document.getElementById('sprint-progress');
        if (progEl) progEl.style.width = `${(sprintIndex / sprintList.length) * 100}%`;
        
        if (sprintWordDisplay) sprintWordDisplay.textContent = currentWord.word;

        if (sprintStepMeaning) sprintStepMeaning.style.display = 'block';
        if (sprintMeaningInput) {
            sprintMeaningInput.value = '';
            sprintMeaningInput.disabled = false;
        }
        if (sprintMeaningFeedback) sprintMeaningFeedback.innerHTML = '';
        if (btnSprintCheckMeaning) {
            btnSprintCheckMeaning.style.display = 'block';
            btnSprintCheckMeaning.innerHTML = '<i class="ri-check-line"></i> 确认';
            btnSprintCheckMeaning.disabled = false;
        }

        if (sprintStepForm) sprintStepForm.style.display = 'none';
        if (btnSprintNext) btnSprintNext.style.display = 'none';
        if (btnSprintDontKnow) { btnSprintDontKnow.style.display = 'inline-flex'; btnSprintDontKnow.disabled = false; }

        // Reset etymology card for new word
        const etymCard = document.getElementById('etymology-card');
        if (etymCard) etymCard.style.display = 'none';
        const etymContent = document.getElementById('etymology-content');
        if (etymContent) etymContent.textContent = '';
        const etymSavedMsg = document.getElementById('etymology-saved-msg');
        if (etymSavedMsg) etymSavedMsg.style.display = 'none';
        const btnSaveEtym = document.getElementById('btn-save-etymology');
        if (btnSaveEtym) { btnSaveEtym.disabled = false; btnSaveEtym.style.opacity = '1'; }

        // Reset word-info card and pre-fetch in background
        const wordInfoCard = document.getElementById('word-info-card');
        if (wordInfoCard) wordInfoCard.style.display = 'none';
        currentWordInfo = null;
        wordInfoPromise = fetch(`/api/word-info?word=${encodeURIComponent(currentWord.word)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => { currentWordInfo = data; return data; })
            .catch(() => null);

        setTimeout(() => {
            playSprintAudio();
            if (sprintMeaningInput) sprintMeaningInput.focus();
        }, 300);
    }

    if (btnSprintCheckMeaning) {
        btnSprintCheckMeaning.addEventListener('click', async () => {
            const inputVal = sprintMeaningInput.value.trim();
            if (!inputVal) return;
            
            const currentWord = sprintList[sprintIndex];
            
            btnSprintCheckMeaning.disabled = true;
            btnSprintCheckMeaning.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 校验中...';
            if (btnSprintDontKnow) btnSprintDontKnow.disabled = true;

            try {
                // Ensure word info is ready before checking meaning
                const wordInfo = currentWordInfo || await wordInfoPromise;
                const apiDef = wordInfo?.definition || currentWord.meaning;

                const res = await fetch('/api/check_meaning', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        word: currentWord.word,
                        target_meaning: apiDef,
                        user_input: inputVal
                    })
                });
                const data = await res.json();
                
                if (data.result === 'correct') {
                    sprintMeaningFeedback.innerHTML = '<span style="color:#059669"><i class="ri-checkbox-circle-fill"></i> 意思准确！(标准答案: ' + apiDef + ')</span>';
                    sprintMeaningInput.disabled = true;
                    btnSprintCheckMeaning.style.display = 'none';
                    if (btnSprintDontKnow) btnSprintDontKnow.style.display = 'none';
                    
                    if (currentWord.has_form_change) {
                        sprintStepForm.style.display = 'block';
                        sprintFormPrompt.innerHTML = `🎉 太棒了！写出它的 <b>${currentWord.form_change_hint}</b> 形式：`;
                        sprintFormInput.value = '';
                        sprintFormInput.disabled = false;
                        sprintFormFeedback.innerHTML = '';
                        btnSprintCheckForm.style.display = 'block';
                        showWordInfoCard(wordInfo);
                        setTimeout(() => sprintFormInput.focus(), 100);
                    } else {
                        handleSprintResult(currentWord, true);
                        showWordInfoCard(wordInfo);
                        fetchAndShowEtymology(currentWord);
                        btnSprintNext.style.display = 'block';
                        btnSprintNext.focus();
                    }
                } else if (data.result === 'fuzzy') {
                    sprintMeaningFeedback.innerHTML = '<span style="color:#d97706"><i class="ri-error-warning-fill"></i> 意思接近，但是不够准确，请再试一次。(参考: ' + apiDef + ')</span>';
                    sprintMeaningInput.value = '';
                    setTimeout(() => sprintMeaningInput.focus(), 100);
                    btnSprintCheckMeaning.disabled = false;
                    btnSprintCheckMeaning.innerHTML = '<i class="ri-check-line"></i> 确认';
                } else {
                    sprintMeaningFeedback.innerHTML = '<span style="color:#dc2626"><i class="ri-close-circle-fill"></i> 错误。(标准答案: ' + apiDef + ')</span>';
                    sprintMeaningInput.disabled = true;
                    btnSprintCheckMeaning.style.display = 'none';
                    if (btnSprintDontKnow) btnSprintDontKnow.style.display = 'none';
                    handleSprintResult(currentWord, false);
                    showWordInfoCard(wordInfo);
                    fetchAndShowEtymology(currentWord);
                    btnSprintNext.style.display = 'block';
                    btnSprintNext.focus();
                }
            } catch (e) {
                console.error(e);
                sprintMeaningFeedback.innerHTML = '<span style="color:#dc2626">校验失败，请重试</span>';
                btnSprintCheckMeaning.disabled = false;
                btnSprintCheckMeaning.innerHTML = '<i class="ri-check-line"></i> 确认';
            }
        });
        
        if (sprintMeaningInput) {
            sprintMeaningInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') btnSprintCheckMeaning.click();
            });
        }
    }

    if (btnSprintDontKnow) {
        btnSprintDontKnow.addEventListener('click', async () => {
            const currentWord = sprintList[sprintIndex];

            btnSprintDontKnow.disabled = true;
            btnSprintCheckMeaning.disabled = true;
            btnSprintCheckMeaning.style.display = 'none';
            if (sprintMeaningInput) sprintMeaningInput.disabled = true;

            // Await pre-fetched word info
            const wordInfo = currentWordInfo || await wordInfoPromise;
            const apiDef = wordInfo?.definition || currentWord.meaning;

            sprintMeaningFeedback.innerHTML = `<span style="color:#f87171"><i class="ri-close-circle-fill"></i> 不会。（正确意思：${apiDef}）</span>`;

            handleSprintResult(currentWord, false);
            showWordInfoCard(wordInfo);
            fetchAndShowEtymology(currentWord);
            btnSprintDontKnow.style.display = 'none';
            btnSprintNext.style.display = 'block';
            btnSprintNext.focus();
        });
    }

    if (btnSprintCheckForm) {
        btnSprintCheckForm.addEventListener('click', () => {
            const inputVal = sprintFormInput.value.trim().toLowerCase();
            if (!inputVal) return;
            
            const currentWord = sprintList[sprintIndex];
            const expectedForm = (currentWord.form_change_word || '').trim().toLowerCase();
            sprintFormInput.disabled = true;
            btnSprintCheckForm.style.display = 'none';

            if (inputVal === expectedForm) {
                sprintFormFeedback.innerHTML = '<span style="color:#059669"><i class="ri-checkbox-circle-fill"></i> 完全正确！</span>';
                handleSprintResult(currentWord, true);
            } else {
                sprintFormFeedback.innerHTML = '<span style="color:#dc2626"><i class="ri-close-circle-fill"></i> 拼写错误。(正确答案: ' + currentWord.form_change_word + ')</span>';
                handleSprintResult(currentWord, false);
            }
            fetchAndShowEtymology(currentWord);
            btnSprintNext.style.display = 'block';
            btnSprintNext.focus();
            showWordInfoCard(currentWordInfo);
        });

        if (sprintFormInput) {
            sprintFormInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') btnSprintCheckForm.click();
            });
        }
    }

    function handleSprintResult(wordObj, isCorrect) {
        const ebData = window.ebbinghaus.data[wordObj.word];
        const isReview = wordObj.__sprintMode === 'review' || (!wordObj.__sprintMode && !!ebData);
        // Use API-fetched definition for new Ebbinghaus entries; existing entries are untouched
        const meaningToStore = (currentWordInfo && currentWordInfo.definition) ? currentWordInfo.definition : wordObj.meaning;

        if (isCorrect) {
            if (isReview) {
                window.ebbinghaus.markReviewSuccess(wordObj.word);
            } else {
                // 新词答对：记入系统但不计错误次数
                window.ebbinghaus.markNewWordCorrect(wordObj.word, meaningToStore, 'en');
            }
        } else {
            if (isReview) {
                window.ebbinghaus.markReviewFail(wordObj.word);
            } else {
                window.ebbinghaus.addOrUpdateMistake(wordObj.word, meaningToStore, 'en');
            }
        }
        renderEbbinghausStats();
    }

    if (btnSprintNext) {
        btnSprintNext.addEventListener('click', () => {
            sprintIndex++;
            saveSprintCheckpoint();
            loadSprintWord();
        });
    }

    if (btnExitSprint) {
        btnExitSprint.addEventListener('click', () => {
            if (confirm('确定要中断今日冲刺吗？已完成的进度已保存。')) {
                saveSprintCheckpoint();
                if (document.getElementById('nav-home-sprint')) {
                    document.getElementById('nav-home-sprint').click();
                }
            }
        });
    }

    // 关闭标签页/刷新/后退时自动保存冲刺断点
    window.addEventListener('beforeunload', () => {
        const sprintPage = document.getElementById('page-sprint-dictation');
        if (sprintPage && sprintPage.classList.contains('active') && sprintList.length > 0) {
            saveSprintCheckpoint();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const sprintPage = document.getElementById('page-sprint-dictation');
            if (sprintPage && sprintPage.classList.contains('active') && sprintList.length > 0) {
                saveSprintCheckpoint();
            }
        }
    });

    // ---- Etymology (词根词缀) Feature ----

    // Show word-info card with API-fetched data
    function showWordInfoCard(info) {
        const card = document.getElementById('word-info-card');
        if (!card) return;
        if (!info || info.error) { return; }  // silently skip if API failed

        const posEl = document.getElementById('word-info-pos');
        const defEl = document.getElementById('word-info-def');
        const exEnEl = document.getElementById('word-info-example-en');
        const exZhEl = document.getElementById('word-info-example-zh');

        if (posEl) posEl.textContent = info.part_of_speech || '';
        if (defEl) defEl.textContent = info.definition || '';
        if (exEnEl) exEnEl.textContent = info.example_en || '';
        if (exZhEl) exZhEl.textContent = info.example_zh || '';

        card.style.display = 'block';
    }

    // Fetch etymology from the server and populate/show the card
    function formatEtymologyText(text) {
        if (!text) return '<span style="color:#94a3b8;">暂无词根词缀信息</span>';

        // Split by numbered items like "1. ", "2. ", "3. "
        const items = text.split(/^\d+\.\s+/m).filter(s => s.trim());

        if (items.length <= 1) {
            // No numbered items, return as-is with better formatting
            return text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .map(line => `<div style="margin-bottom:8px; line-height:1.6;">${line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#6ee7b7;">$1</strong>')}</div>`)
                .join('');
        }

        // Format as numbered items with cards
        return items.map((item, idx) => {
            const trimmed = item.trim();
            if (!trimmed) return '';
            const number = idx + 1;
            const bgColor = ['rgba(99,102,241,0.12)', 'rgba(16,185,129,0.12)', 'rgba(168,85,247,0.12)'][idx % 3];
            const textColor = ['#a5b4fc', '#6ee7b7', '#d8b4fe'][idx % 3];
            const lines = trimmed.split('\n').map(line => line.trim()).filter(l => l);
            const formattedText = lines
                .map(line => line.replace(/\*\*(.*?)\*\*/g, `<strong style="color:${textColor}; font-weight:700;">$1</strong>`))
                .join('<br>');
            return `
                <div style="background:${bgColor}; border-radius:8px; padding:10px 12px; margin-bottom:8px; border-left:3px solid ${textColor};">
                    <div style="color:${textColor}; font-weight:700; font-size:13px; margin-bottom:4px;">第 ${number} 点</div>
                    <div style="color:#e2e8f0; font-size:13px; line-height:1.6;">${formattedText}</div>
                </div>
            `;
        }).join('');
    }

    function fetchAndShowEtymology(wordObj) {
        const card = document.getElementById('etymology-card');
        const loading = document.getElementById('etymology-loading');
        const content = document.getElementById('etymology-content');
        if (!card || !content) return;

        card.style.display = 'block';
        if (loading) loading.style.display = 'inline';
        content.innerHTML = '';

        fetch(`/api/etymology?word=${encodeURIComponent(wordObj.word)}`)
            .then(r => r.json())
            .then(data => {
                if (loading) loading.style.display = 'none';
                const etymologyText = data.etymology || '暂无词根词缀信息';
                content.innerHTML = formatEtymologyText(etymologyText);
                // Store current word info on the card for save handler
                card.dataset.word = wordObj.word;
                card.dataset.meaning = wordObj.meaning || '';
                card.dataset.etymology = etymologyText;
            })
            .catch(() => {
                if (loading) loading.style.display = 'none';
                content.innerHTML = '<span style="color:#94a3b8;">(词根词缀解析暂时不可用)</span>';
            });
    }

    const btnSaveEtymology = document.getElementById('btn-save-etymology');
    if (btnSaveEtymology) {
        btnSaveEtymology.addEventListener('click', () => {
            const card = document.getElementById('etymology-card');
            if (!card) return;
            const word = card.dataset.word;
            const meaning = card.dataset.meaning;
            const etymology = card.dataset.etymology;
            if (!word || !etymology) return;

            saveEtymologyNote(word, meaning, etymology);

            btnSaveEtymology.disabled = true;
            btnSaveEtymology.style.opacity = '0.5';
            const savedMsg = document.getElementById('etymology-saved-msg');
            if (savedMsg) savedMsg.style.display = 'inline';
        });
    }

    // ---- Etymology Notebook ----
    const ETYMOLOGY_NOTES_KEY = 'hearmemo_etymology_notes';

    function loadNotes() {
        try {
            return JSON.parse(localStorage.getItem(ETYMOLOGY_NOTES_KEY) || '[]');
        } catch (e) { return []; }
    }

    function saveEtymologyNote(word, meaning, etymology) {
        const notes = loadNotes();
        // Update if exists, otherwise prepend
        const existingIdx = notes.findIndex(n => n.word === word);
        const note = { word, meaning, etymology, savedAt: window.ebbinghaus.formatDate(new Date()) };
        if (existingIdx >= 0) {
            notes[existingIdx] = note;
        } else {
            notes.unshift(note);
        }
        localStorage.setItem(ETYMOLOGY_NOTES_KEY, JSON.stringify(notes));
    }

    function deleteNote(word) {
        const notes = loadNotes().filter(n => n.word !== word);
        localStorage.setItem(ETYMOLOGY_NOTES_KEY, JSON.stringify(notes));
    }

    function renderNotebook(filter) {
        const listEl = document.getElementById('notebook-list');
        const emptyEl = document.getElementById('notebook-empty');
        const countEl = document.getElementById('notebook-count');
        if (!listEl) return;

        let notes = loadNotes();
        if (filter) {
            const q = filter.toLowerCase();
            notes = notes.filter(n => n.word.toLowerCase().includes(q) || (n.meaning || '').includes(q));
        }

        if (countEl) countEl.textContent = `共 ${notes.length} 条`;

        if (notes.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        listEl.innerHTML = '';
        notes.forEach(note => {
            const div = document.createElement('div');
            div.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid rgba(99,102,241,0.2);';
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <strong style="color:#a5b4fc;font-size:17px;">${note.word}</strong>
                        <span style="color:#94a3b8;font-size:13px;margin-left:8px;">${note.meaning || ''}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:11px;color:#64748b;">${note.savedAt}</span>
                        <button data-word="${note.word}" class="btn-delete-note" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-family:inherit;">删除</button>
                    </div>
                </div>
                <div style="color:#e2e8f0;font-size:14px;line-height:1.8;white-space:pre-wrap;">${note.etymology}</div>
            `;
            div.querySelector('.btn-delete-note').addEventListener('click', (e) => {
                if (confirm(`确定删除 "${note.word}" 的词根笔记吗？`)) {
                    deleteNote(note.word);
                    renderNotebook(document.getElementById('notebook-search')?.value.trim());
                }
            });
            listEl.appendChild(div);
        });
    }

    const notebookSearch = document.getElementById('notebook-search');
    if (notebookSearch) {
        notebookSearch.addEventListener('input', () => {
            renderNotebook(notebookSearch.value.trim());
        });
    }

    // ---- Sprint Session Frequency Tracking ----
    const SPRINT_SESSIONS_KEY = 'hearmemo_sprint_sessions';

    function getSessionsThisWeek() {
        try {
            const sessions = JSON.parse(localStorage.getItem(SPRINT_SESSIONS_KEY) || '[]');
            const today = new Date();
            const weekAgoStr = window.ebbinghaus.formatDate(new Date(today - 7 * 24 * 60 * 60 * 1000));
            return sessions.filter(d => d >= weekAgoStr);
        } catch (e) { return []; }
    }

    function recordTodaySession() {
        try {
            const sessions = JSON.parse(localStorage.getItem(SPRINT_SESSIONS_KEY) || '[]');
            const todayStr = window.ebbinghaus.formatDate(new Date());
            if (!sessions.includes(todayStr)) {
                sessions.push(todayStr);
                // Keep only last 30 days
                const cutoff = window.ebbinghaus.formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
                localStorage.setItem(SPRINT_SESSIONS_KEY, JSON.stringify(sessions.filter(d => d >= cutoff)));
            }
        } catch (e) {}
    }

    function renderSprintFrequencyNotice() {
        const statsEl = document.getElementById('sprint-stats-display');
        if (!statsEl || !currentUser) return;
        const isLowerGrade = ['7', '8'].includes(currentUser.grade);
        const sessions = getSessionsThisWeek();
        const grade9Words = getLoadedGrade9Words();
        const grade9WordSet = new Set(grade9Words.map(w => w.word));
        const reviewCount = window.ebbinghaus.getTodayReviewList().filter(i => {
            if (i.subject !== 'en') return false;
            return grade9WordSet.size === 0 || grade9WordSet.has(i.word);
        }).length;
        if (isLowerGrade) {
            const remaining = Math.max(0, 3 - sessions.length);
            statsEl.innerHTML = `本周已完成 <strong>${sessions.length}</strong> 次 · 本周还剩 <strong>${remaining}</strong> 次推荐任务<br><span style="font-size:12px;">今日待复习 ${reviewCount} 词</span>`;
        } else if (currentUser.grade === '9') {
            const seenCount = grade9WordSet.size > 0
                ? Object.values(window.ebbinghaus.data).filter(i => i.subject === 'en' && grade9WordSet.has(i.word)).length
                : Object.values(window.ebbinghaus.data).filter(i => i.subject === 'en').length;
            const totalText = grade9Words.length > 0 ? ` / ${grade9Words.length}` : '';
            statsEl.innerHTML = `今日待复习 <strong>${reviewCount}</strong> 词<br><span style="font-size:12px;">已记录/已背过 ${seenCount}${totalText} 词</span>`;
        } else {
            statsEl.innerHTML = `今日待复习 <strong>${reviewCount}</strong> 词`;
        }
    }

    function getLoadedGrade9Words() {
        const words = [];
        Object.values(units || {}).forEach(unitObj => {
            const isArray = Array.isArray(unitObj);
            const wordList = isArray ? unitObj : unitObj.words;
            const subject = isArray ? 'en' : (unitObj.subject || 'en');
            const grade = isArray ? 'all' : (unitObj.grade || 'all');
            if (grade === '9' && subject === 'en' && Array.isArray(wordList)) {
                words.push(...wordList);
            }
        });
        return words;
    }

    // ---- Sprint Checkpoint (断点续背) ----
    const SPRINT_CHECKPOINT_KEY = 'hearmemo_sprint_checkpoint';

    function saveSprintCheckpoint() {
        if (sprintList.length === 0) return;
        const today = window.ebbinghaus.formatDate(new Date());
        localStorage.setItem(getSprintCheckpointKey(currentSprintMode), JSON.stringify({ date: today, mode: currentSprintMode, list: sprintList, index: sprintIndex }));
    }

    function clearSprintCheckpoint(mode = currentSprintMode) {
        localStorage.removeItem(getSprintCheckpointKey(mode));
    }

    function loadSprintCheckpoint(mode) {
        clearLegacySprintCheckpoint();
        const cp = readSprintCheckpoint(mode);
        if (!cp) return null;
        const today = window.ebbinghaus.formatDate(new Date());
        if (cp.date !== today || cp.mode !== mode) {
            clearSprintCheckpoint(mode);
            return null;
        }
        return cp;
    }

    function readSprintCheckpoint(mode) {
        try {
            const cp = JSON.parse(localStorage.getItem(getSprintCheckpointKey(mode)) || 'null');
            return cp || null;
        } catch (e) { return null; }
    }

    function getSprintCheckpointKey(mode) {
        return `${SPRINT_CHECKPOINT_KEY}_${mode || 'mixed'}`;
    }

    function clearLegacySprintCheckpoint() {
        try {
            const cp = JSON.parse(localStorage.getItem(SPRINT_CHECKPOINT_KEY) || 'null');
            if (cp && !cp.mode) localStorage.removeItem(SPRINT_CHECKPOINT_KEY);
        } catch (e) {
            localStorage.removeItem(SPRINT_CHECKPOINT_KEY);
        }
    }

    // ── 教师端：学生进度总览 ─────────────────────────────────────────────
    async function renderStudentProgress() {
        const wrap = document.getElementById('students-table-wrap');
        if (!wrap) return;
        wrap.innerHTML = '<div class="empty-state">加载中…</div>';
        try {
            const resp = await fetch('/api/progress/all', { headers: authHeaders() });
            if (!resp.ok) { wrap.innerHTML = '<div class="empty-state">权限不足 或加载失败</div>'; return; }
            const rows = await resp.json();
            if (rows.length === 0) { wrap.innerHTML = '<div class="empty-state">暂无学生数据。学生完成冲刺或五年级翻译后会自动同步。</div>'; return; }

            const today = new Date().toISOString().slice(0, 10);
            const tableRows = rows.map(r => {
                const lastSync = r.last_synced ? new Date(r.last_synced) : null;
                const minsAgo  = lastSync ? Math.round((Date.now() - lastSync) / 60000) : null;
                const syncLabel = minsAgo === null ? '从未'
                    : minsAgo < 60 ? `${minsAgo} 分钟前`
                    : minsAgo < 1440 ? `${Math.round(minsAgo/60)} 小时前`
                    : `${Math.round(minsAgo/1440)} 天前`;
                const todayActive = r.today_words > 0 || r.grade5_today > 0;
                const todayLabel = (() => {
                    const parts = [];
                    if (r.today_words > 0) parts.push(`冲刺 ${r.today_words} 词`);
                    if (r.grade5_today > 0) parts.push(`翻译 ${r.grade5_today} 句`);
                    return parts.length ? '✅ 今日：' + parts.join('、') : '❌ 今日未学习';
                })();
                const pct = r.total_seen > 0 ? ((r.mastered / Math.max(r.total_seen,1)) * 100).toFixed(0) : 0;
                const grade5Cell = r.grade === '5'
                    ? `<span style="font-size:15px;font-weight:700;color:#f472b6">${r.grade5_total}</span><span style="color:#94a3b8;font-size:12px"> 句已练</span>${r.grade5_today > 0 ? `<br><span style="color:#f59e0b;font-size:12px">今日+${r.grade5_today}</span>` : ''}`
                    : `<span style="color:#475569;font-size:12px">—</span>`;
                const sprintCell = r.total_seen > 0
                    ? `<span style="font-size:15px;font-weight:700;color:#818cf8">${r.total_seen}</span><span style="color:#94a3b8;font-size:12px"> 词</span> <span style="color:#10b981;font-weight:600">${r.mastered}</span><span style="color:#94a3b8;font-size:12px"> 掌握(${pct}%)</span>`
                    : `<span style="color:#475569;font-size:12px">—</span>`;
                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
                    <td style="padding:12px 10px; font-weight:600">${r.username}</td>
                    <td style="padding:12px 10px; color:#94a3b8; font-size:13px">${r.grade === '9' ? '九年级' : r.grade === '8' ? '八年级' : r.grade === '7' ? '七年级' : r.grade === '4' ? '四年级' : r.grade === '5' ? '五年级' : r.grade}</td>
                    <td style="padding:12px 10px">${sprintCell}</td>
                    <td style="padding:12px 10px">${grade5Cell}</td>
                    <td style="padding:12px 10px">
                        <span style="${todayActive ? 'color:#f59e0b;font-weight:600' : 'color:#94a3b8'}">${todayLabel}</span>
                    </td>
                    <td style="padding:12px 10px; color:#64748b; font-size:12px">${syncLabel}同步</td>
                    <td style="padding:12px 10px">
                        <button onclick="showStudentDetail('${r.username}')" style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px">详情</button>
                    </td>
                </tr>`;
            }).join('');

            wrap.innerHTML = `
                <div style="overflow-x:auto">
                <table style="width:100%; border-collapse:collapse; font-size:14px">
                    <thead>
                        <tr style="color:#64748b; font-size:12px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.1)">
                            <th style="padding:8px 10px;text-align:left">姓名</th>
                            <th style="padding:8px 10px;text-align:left">年级</th>
                            <th style="padding:8px 10px;text-align:left">冲刺进度</th>
                            <th style="padding:8px 10px;text-align:left;color:#f472b6">五年级翻译</th>
                            <th style="padding:8px 10px;text-align:left">今日状态</th>
                            <th style="padding:8px 10px;text-align:left">同步时间</th>
                            <th style="padding:8px 10px;text-align:left"></th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                </div>`;
        } catch (e) {
            wrap.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`;
        }
    }

    // 查看某学生的错词详情
    window.showStudentDetail = async function(username) {
        try {
            const resp = await fetch(`/api/progress/detail/${encodeURIComponent(username)}`, { headers: authHeaders() });
            if (!resp.ok) { alert('加载失败'); return; }
            const data = await resp.json();
            const eb = data.eb_snapshot || {};
            const words = Object.values(eb).sort((a, b) => (b.mistakes || 0) - (a.mistakes || 0));
            const problemWords = words.filter(w => w.mistakes > 0).slice(0, 50);

            const win = window.open('', '_blank');
            const rows = problemWords.map(w =>
                `<tr><td>${w.word}</td><td>${w.meaning||''}</td><td style="color:${w.mistakes>2?'#dc2626':'#f59e0b'}">${w.mistakes} 次</td><td>${w.nextReviewDate==='2099-12-31'?'✅已掌握':('Lv.'+w.level+' 下次:'+w.nextReviewDate)}</td></tr>`
            ).join('');
            win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${username} 的学习详情</title>
              <style>body{font-family:system-ui;margin:20px 30px}table{border-collapse:collapse;width:100%}td,th{padding:8px 12px;border:1px solid #eee;font-size:13px}th{background:#f8f8f8}h2{color:#4338ca}</style></head>
              <body><h2>${username} · 易错词 Top 50</h2>
              <p style="color:#888">同步时间：${data.last_synced} · 共 ${words.length} 词在记忆库</p>
              <table><tr><th>单词</th><th>中文</th><th>错误次数</th><th>状态</th></tr>${rows||'<tr><td colspan=4 style="color:#888">暂无错词记录</td></tr>'}</table>
              </body></html>`);
            win.document.close();
        } catch (e) { alert('加载失败: ' + e.message); }
    };

    const btnRefreshStudents = document.getElementById('btn-refresh-students');
    if (btnRefreshStudents) {
        btnRefreshStudents.addEventListener('click', renderStudentProgress);
    }
    
    // ---- Grade 5 Translation Mode ----
    let grade5Tasks = [];
    let grade5Index = 0;
    let grade5Stats = { correct: 0, total: 0 };
    let grade5MissedPhrase = null;
    let grade5MissedPhraseMeaning = null;
    let grade5CurrentTitle = '';

    const GRADE5_CP_KEY = 'hearmemo_grade5_checkpoint';

    function saveGrade5Checkpoint(title, index) {
        localStorage.setItem(GRADE5_CP_KEY, JSON.stringify({ title, index }));
    }

    function loadGrade5Checkpoint(title) {
        try {
            const cp = JSON.parse(localStorage.getItem(GRADE5_CP_KEY) || 'null');
            if (cp && cp.title === title && cp.index > 0) return cp;
        } catch (e) {}
        return null;
    }

    function clearGrade5Checkpoint() {
        localStorage.removeItem(GRADE5_CP_KEY);
    }

    function startGrade5Translation(title, sentenceList) {
        if (!sentenceList || sentenceList.length === 0) return;

        // Build task list: first pass EN→ZH, second pass ZH→EN (each sentence tested twice)
        grade5Tasks = [];
        sentenceList.forEach(s => {
            grade5Tasks.push({ direction: 'en2zh', sentence_en: s.word, sentence_zh: s.meaning });
        });
        sentenceList.forEach(s => {
            grade5Tasks.push({ direction: 'zh2en', sentence_en: s.word, sentence_zh: s.meaning });
        });

        // Check for saved checkpoint
        const cp = loadGrade5Checkpoint(title);
        if (cp && cp.index < grade5Tasks.length) {
            const resume = confirm(`上次做到第 ${cp.index} 题 / 共 ${grade5Tasks.length} 题，是否继续？

点『确定』接着做，点『取消』从第一题重新开始。`);
            grade5Index = resume ? cp.index : 0;
            if (!resume) clearGrade5Checkpoint();
        } else {
            grade5Index = 0;
            clearGrade5Checkpoint();
        }

        grade5Stats = { correct: 0, total: grade5Tasks.length };
        grade5CurrentTitle = title;

        navLinks.forEach(l => l.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('page-grade5-translation').classList.add('active');

        document.getElementById('grade5-translation-title').innerText = `翻译练习: ${title}`;
        document.getElementById('grade5-total-idx').innerText = grade5Tasks.length;

        loadGrade5Task();
    }

    function loadGrade5Task() {
        if (grade5Index >= grade5Tasks.length) {
            finishGrade5Translation();
            return;
        }

        const task = grade5Tasks[grade5Index];
        grade5MissedPhrase = null;
        grade5MissedPhraseMeaning = null;

        const isEn2Zh = task.direction === 'en2zh';
        const sourceSentence = isEn2Zh ? task.sentence_en : task.sentence_zh;

        // Progress
        document.getElementById('grade5-current-idx').innerText = grade5Index + 1;
        document.getElementById('grade5-translation-progress').style.width =
            `${(grade5Index / grade5Tasks.length) * 100}%`;

        // Direction badge
        const badge = document.getElementById('grade5-direction-badge');
        if (isEn2Zh) {
            badge.textContent = '第一关：看英文，写中文';
            badge.style.background = 'rgba(99,102,241,0.2)';
            badge.style.color = '#a5b4fc';
        } else {
            badge.textContent = '第二关：看中文，写英文';
            badge.style.background = 'rgba(16,185,129,0.2)';
            badge.style.color = '#6ee7b7';
        }

        // Source sentence
        document.getElementById('grade5-source-sentence').textContent = sourceSentence;

        // Reset main input area
        const translInput = document.getElementById('grade5-translation-input');
        translInput.value = '';
        translInput.disabled = false;
        translInput.placeholder = isEn2Zh ? '请输入中文翻译...' : 'Please type the English translation...';

        document.getElementById('grade5-main-feedback').innerHTML = '';
        document.getElementById('grade5-main-input-area').style.display = 'block';

        const checkBtn = document.getElementById('btn-grade5-check');
        checkBtn.style.display = 'inline-flex';
        checkBtn.disabled = false;
        checkBtn.innerHTML = '<i class="ri-check-line"></i> 确认';

        const skipBtn = document.getElementById('btn-grade5-skip');
        skipBtn.style.display = 'inline-flex';
        skipBtn.disabled = false;

        // Reset follow-up area
        document.getElementById('grade5-followup-area').style.display = 'none';
        document.getElementById('grade5-followup-input').value = '';
        document.getElementById('grade5-followup-feedback').innerHTML = '';

        const followupCheckBtn = document.getElementById('btn-grade5-followup-check');
        followupCheckBtn.style.display = 'block';
        followupCheckBtn.disabled = false;
        followupCheckBtn.innerHTML = '<i class="ri-check-line"></i> 确认';

        document.getElementById('btn-grade5-next').style.display = 'none';

        // Auto-play and focus
        playGrade5Audio();
        setTimeout(() => translInput.focus(), 400);
    }

    function playGrade5Audio() {
        if (grade5Index >= grade5Tasks.length) return;
        const task = grade5Tasks[grade5Index];
        const isEn2Zh = task.direction === 'en2zh';
        const text = isEn2Zh ? task.sentence_en : task.sentence_zh;
        const lang = isEn2Zh ? 'en' : 'zh';
        const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}&_t=${Date.now()}`;
        const audio = new Audio(url);
        audio.play().catch(e => console.error('Grade5 TTS error:', e));
    }

    function getGrade5RecordKey(task) {
        const directionLabel = task.direction === 'en2zh' ? '英译中' : '中译英';
        return `五年级课文:${grade5CurrentTitle}:${directionLabel}:${task.sentence_en}`;
    }

    function trackGrade5StudyResult(task, isCorrect) {
        const recordKey = getGrade5RecordKey(task);
        const meaning = task.direction === 'en2zh' ? task.sentence_zh : task.sentence_en;
        const exists = !!window.ebbinghaus.data[recordKey];

        if (isCorrect) {
            if (exists) {
                window.ebbinghaus.markReviewSuccess(recordKey);
            } else {
                window.ebbinghaus.markNewWordCorrect(recordKey, meaning, 'grade5-translation');
            }
        } else {
            if (exists) {
                window.ebbinghaus.markReviewFail(recordKey);
            } else {
                window.ebbinghaus.addOrUpdateMistake(recordKey, meaning, 'grade5-translation');
            }
        }
    }

    async function checkGrade5Translation() {
        const task = grade5Tasks[grade5Index];
        const translInput = document.getElementById('grade5-translation-input');
        const userInput = translInput.value.trim();
        if (!userInput) return;

        const checkBtn = document.getElementById('btn-grade5-check');
        checkBtn.disabled = true;
        checkBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 校验中...';
        document.getElementById('btn-grade5-skip').disabled = true;
        translInput.disabled = true;

        try {
            const res = await fetch('/api/check_translation', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    sentence_en: task.sentence_en,
                    sentence_zh: task.sentence_zh,
                    user_input: userInput,
                    direction: task.direction
                })
            });
            const data = await res.json();
            const feedbackEl = document.getElementById('grade5-main-feedback');

            if (data.result === 'correct') {
                feedbackEl.innerHTML = '<span style="color:#059669"><i class="ri-checkbox-circle-fill"></i> 翻译正确！</span>';
                trackGrade5StudyResult(task, true);
                grade5Stats.correct++;
                checkBtn.style.display = 'none';
                document.getElementById('btn-grade5-skip').style.display = 'none';
                document.getElementById('btn-grade5-next').style.display = 'block';
                document.getElementById('btn-grade5-next').focus();
            } else {
                trackGrade5StudyResult(task, false);
                if (data.result === 'fuzzy') {
                    feedbackEl.innerHTML = '<span style="color:#d97706"><i class="ri-error-warning-fill"></i> 翻译还不够完整，来看看漏掉了什么吧</span>';
                } else {
                    feedbackEl.innerHTML = '<span style="color:#dc2626"><i class="ri-close-circle-fill"></i> 翻译有误，我们来练习一下关键词</span>';
                }
                checkBtn.style.display = 'none';
                document.getElementById('btn-grade5-skip').style.display = 'none';

                if (data.missed_phrase && data.missed_phrase_meaning) {
                    grade5MissedPhrase = data.missed_phrase;
                    grade5MissedPhraseMeaning = data.missed_phrase_meaning;
                    showGrade5FollowUp(task.direction);
                } else {
                    document.getElementById('btn-grade5-next').style.display = 'block';
                }
            }
        } catch (e) {
            console.error('checkGrade5Translation error:', e);
            document.getElementById('grade5-main-feedback').innerHTML =
                '<span style="color:#dc2626">校验失败，请重试</span>';
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="ri-check-line"></i> 确认';
            document.getElementById('btn-grade5-skip').disabled = false;
            translInput.disabled = false;
        }
    }

    function showGrade5FollowUp(direction) {
        const isEn2Zh = direction === 'en2zh';
        const followupArea = document.getElementById('grade5-followup-area');
        const followupQ = document.getElementById('grade5-followup-question');
        const followupInput = document.getElementById('grade5-followup-input');

        followupArea.style.display = 'block';
        // Ask about the missed phrase in the target language
        if (isEn2Zh) {
            followupQ.textContent = `你知道 "${grade5MissedPhrase}" 是什么意思吗？请用中文回答。`;
            followupInput.placeholder = '请输入中文意思...';
        } else {
            followupQ.textContent = `"${grade5MissedPhrase}" 用英文怎么说？请输入英文答案。`;
            followupInput.placeholder = 'Type the English...';
        }

        followupInput.value = '';
        followupInput.disabled = false;
        document.getElementById('grade5-followup-feedback').innerHTML = '';

        const followupCheckBtn = document.getElementById('btn-grade5-followup-check');
        followupCheckBtn.style.display = 'block';
        followupCheckBtn.disabled = false;
        followupCheckBtn.innerHTML = '<i class="ri-check-line"></i> 确认';

        setTimeout(() => followupInput.focus(), 100);
    }

    async function checkGrade5FollowUp() {
        const followupInput = document.getElementById('grade5-followup-input');
        const followupFeedback = document.getElementById('grade5-followup-feedback');
        const followupCheckBtn = document.getElementById('btn-grade5-followup-check');
        const userInput = followupInput.value.trim();
        if (!userInput) return;

        followupCheckBtn.disabled = true;
        followupCheckBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 校验中...';
        followupInput.disabled = true;

        try {
            const res = await fetch('/api/check_meaning', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    word: grade5MissedPhrase,
                    target_meaning: grade5MissedPhraseMeaning,
                    user_input: userInput
                })
            });
            const data = await res.json();

            followupCheckBtn.style.display = 'none';
            if (data.result === 'correct') {
                followupFeedback.innerHTML =
                    `<span style="color:#059669"><i class="ri-checkbox-circle-fill"></i> 答对了！"${grade5MissedPhrase}" 就是 "${grade5MissedPhraseMeaning}"，记住了吗？</span>`;
            } else {
                followupFeedback.innerHTML =
                    `<span style="color:#f87171"><i class="ri-close-circle-fill"></i> 还需要记一下："${grade5MissedPhrase}" 的意思是 "${grade5MissedPhraseMeaning}"，下次遇到要认出来哦！</span>`;
            }

            document.getElementById('btn-grade5-next').style.display = 'block';
            document.getElementById('btn-grade5-next').focus();
        } catch (e) {
            console.error('checkGrade5FollowUp error:', e);
            followupFeedback.innerHTML = '<span style="color:#dc2626">校验失败，请重试</span>';
            followupCheckBtn.disabled = false;
            followupCheckBtn.innerHTML = '<i class="ri-check-line"></i> 确认';
            followupInput.disabled = false;
        }
    }

    async function skipGrade5Task() {
        const task = grade5Tasks[grade5Index];
        const isEn2Zh = task.direction === 'en2zh';
        const refAnswer = isEn2Zh ? task.sentence_zh : task.sentence_en;

        trackGrade5StudyResult(task, false);

        document.getElementById('grade5-translation-input').disabled = true;
        document.getElementById('btn-grade5-check').style.display = 'none';
        document.getElementById('btn-grade5-skip').disabled = true;

        const feedbackEl = document.getElementById('grade5-main-feedback');
        feedbackEl.innerHTML = '<span style="color:#94a3b8"><i class="ri-loader-4-line ri-spin"></i> 找一个关键词考考你...</span>';

        try {
            const res = await fetch('/api/check_translation', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    sentence_en: task.sentence_en,
                    sentence_zh: task.sentence_zh,
                    user_input: '不会',
                    direction: task.direction
                })
            });
            const data = await res.json();

            document.getElementById('btn-grade5-skip').style.display = 'none';

            if (data.missed_phrase && data.missed_phrase_meaning) {
                grade5MissedPhrase = data.missed_phrase;
                grade5MissedPhraseMeaning = data.missed_phrase_meaning;
                feedbackEl.innerHTML = `<span style="color:#94a3b8">参考译文：<em style="color:#e2e8f0">${refAnswer}</em></span>`;
                showGrade5FollowUp(task.direction);
            } else {
                feedbackEl.innerHTML =
                    `<span style="color:#94a3b8">没关系，记住参考译文：</span><br><em style="color:#e2e8f0; font-size:16px; line-height:1.7;">${refAnswer}</em>`;
                document.getElementById('btn-grade5-next').style.display = 'block';
            }
        } catch (e) {
            document.getElementById('btn-grade5-skip').style.display = 'none';
            feedbackEl.innerHTML =
                `<span style="color:#94a3b8">参考译文：<em style="color:#e2e8f0">${refAnswer}</em></span>`;
            document.getElementById('btn-grade5-next').style.display = 'block';
        }
    }

    function finishGrade5Translation() {
        clearGrade5Checkpoint();

        const total = grade5Stats.total;
        const correct = grade5Stats.correct;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;

        document.getElementById('idx-total-finished').innerText = total;
        document.getElementById('idx-correct-count').innerText = correct;
        document.getElementById('idx-error-count').innerText = total - correct;
        document.getElementById('result-score').innerText = score;
        document.getElementById('result-title').innerText = '翻译练习完成！';

        resultModal.classList.add('active');
    }

    // Wire up Grade 5 translation page buttons
    const btnGrade5Check = document.getElementById('btn-grade5-check');
    const btnGrade5Skip = document.getElementById('btn-grade5-skip');
    const btnGrade5Next = document.getElementById('btn-grade5-next');
    const btnGrade5Play = document.getElementById('btn-grade5-play');
    const btnGrade5FollowupCheck = document.getElementById('btn-grade5-followup-check');
    const btnExitGrade5 = document.getElementById('btn-exit-grade5-translation');

    if (btnGrade5Check) {
        btnGrade5Check.addEventListener('click', checkGrade5Translation);
        document.getElementById('grade5-translation-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkGrade5Translation();
        });
    }
    if (btnGrade5Skip) {
        btnGrade5Skip.addEventListener('click', skipGrade5Task);
    }
    if (btnGrade5Next) {
        btnGrade5Next.addEventListener('click', () => {
            grade5Index++;
            saveGrade5Checkpoint(grade5CurrentTitle, grade5Index);
            loadGrade5Task();
        });
    }
    if (btnGrade5Play) {
        btnGrade5Play.addEventListener('click', playGrade5Audio);
    }
    if (btnGrade5FollowupCheck) {
        btnGrade5FollowupCheck.addEventListener('click', checkGrade5FollowUp);
        document.getElementById('grade5-followup-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkGrade5FollowUp();
        });
    }
    if (btnExitGrade5) {
        btnExitGrade5.addEventListener('click', () => {
            if (confirm('确定退出翻译练习吗？进度已自动保存，下次可以从断点继续。')) {
                saveGrade5Checkpoint(grade5CurrentTitle, grade5Index);
                navLinks[0].click();
            }
        });
    }

});
