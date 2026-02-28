// 初期データ構造
const DEFAULT_DATA = {
    habits: [
        { id: 'habit_' + Date.now(), name: '無題のカレンダー', createdAt: new Date().toISOString() }
    ],
    records: {},
    settings: {
        theme: 'dark',
        haptic: true,
        effectEnabled: true,
        effectType: 'confetti'
    }
};

let appData = { ...DEFAULT_DATA };
let currentHabitId = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-based
let swiperInstance = null;

// DOM Elements
const body = document.body;
const appEl = document.getElementById('app');
const calendarDaysEl = document.getElementById('calendar-days');
const monthTotalBadge = document.getElementById('month-total-badge');
const currentMonthDisplay = document.getElementById('current-month-display');
const monthPicker = document.getElementById('month-picker');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view-section');

// ユーティリティ関数
const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// データ管理機能
function loadData() {
    const saved = localStorage.getItem('habitTrackerData');
    if (saved) {
        try {
            appData = JSON.parse(saved);
        } catch (e) {
            console.error("データ読み込みエラー", e);
        }
    }

    // 後方互換性のため、プロパティが存在しない場合は初期データを入れる
    if (!appData.records) appData.records = {};
    if (!appData.settings) appData.settings = { ...DEFAULT_DATA.settings };

    if (appData.habits.length > 0) {
        currentHabitId = appData.habits[0].id;
    }

    // 初期化時にテーマ適用
    applyTheme(appData.settings.theme);
}

function saveData() {
    localStorage.setItem('habitTrackerData', JSON.stringify(appData));
}

// 習慣タブの描画とSwiperの初期化
function renderHabitTabs() {
    const wrapper = document.getElementById('habit-tabs-wrapper');
    wrapper.innerHTML = '';

    appData.habits.forEach((habit, index) => {
        const slide = document.createElement('div');
        slide.className = `swiper-slide habit-tab ${habit.id === currentHabitId ? 'active' : ''}`;
        slide.dataset.id = habit.id;

        // 当月の達成数を計算
        const monthTotal = calculateMonthTotal(habit.id, currentYear, currentMonth);

        slide.innerHTML = `
            ${escapeHtml(habit.name)}
            <span class="habit-badge">${monthTotal}</span>
        `;

        let pressTimer = null;
        let isLongPress = false;

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                if (typeof openEditModal === 'function') openEditModal(habit);
            }, 500); // 500ms length for long press
        };

        const cancelPress = () => {
            if (pressTimer) clearTimeout(pressTimer);
        };

        // Long press events
        slide.addEventListener('touchstart', startPress, { passive: true });
        slide.addEventListener('touchend', cancelPress);
        slide.addEventListener('touchmove', cancelPress);
        slide.addEventListener('mousedown', startPress);
        slide.addEventListener('mouseup', cancelPress);
        slide.addEventListener('mouseleave', cancelPress);

        // Standard click events
        slide.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                return;
            }
            currentHabitId = habit.id;
            updateActiveTab();
            renderCalendar();
            swiperInstance.slideTo(index);
        });

        wrapper.appendChild(slide);
    });

    if (swiperInstance) {
        swiperInstance.update();
    } else {
        swiperInstance = new Swiper('.habit-tabs-swiper', {
            slidesPerView: 'auto',
            spaceBetween: 8,
            freeMode: true,
            observer: true,
            observeParents: true,
        });
    }
}

function updateActiveTab() {
    document.querySelectorAll('.habit-tab').forEach(tab => {
        if (tab.dataset.id === currentHabitId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

// カレンダー機能
function renderCalendar() {
    if (!currentHabitId) return;

    calendarDaysEl.innerHTML = '';

    // 表示タイトル更新
    currentMonthDisplay.textContent = `${currentYear}年 ${String(currentMonth + 1).padStart(2, '0')}月`;
    if (monthPicker) {
        monthPicker.value = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    }

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0(Sun) - 6(Sat)

    const today = new Date();
    const todayStr = formatDate(today);

    let monthCount = 0;
    const records = appData.records[currentHabitId] || {};

    // 空白の曜日のセルを追加
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        calendarDaysEl.appendChild(emptyCell);
    }

    // 日付セルを追加
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const dateStr = formatDate(dateObj);

        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.innerHTML = `<span>${day}</span>`;

        if (dateStr === todayStr) {
            cell.classList.add('today');
        }

        if (records[dateStr]) {
            cell.classList.add('checked');
            monthCount++;
        }

        // 過去だけでなく未来もタップできる仕様か？ 通常は今日まで
        const isFuture = dateObj > today;
        if (!isFuture) {
            cell.addEventListener('click', (e) => handleDayClick(dateStr, cell));
        } else {
            cell.style.opacity = 0.3; // 未来は薄くする
        }

        calendarDaysEl.appendChild(cell);
    }

    // 当月の累計表示更新
    monthTotalBadge.textContent = monthCount;

    // タブ側のバッジも更新
    const activeTabBadge = document.querySelector(`.habit-tab[data-id="${currentHabitId}"] .habit-badge`);
    if (activeTabBadge) {
        activeTabBadge.textContent = monthCount;
    }
}

function handleDayClick(dateStr, cell) {
    if (!appData.records[currentHabitId]) {
        appData.records[currentHabitId] = {};
    }

    const isChecked = appData.records[currentHabitId][dateStr];

    if (isChecked) {
        delete appData.records[currentHabitId][dateStr];
        cell.classList.remove('checked');
    } else {
        appData.records[currentHabitId][dateStr] = true;
        cell.classList.add('checked');

        // 演出の実行
        triggerFeedback();
    }

    saveData();

    // UIの表示を更新 (全体再描画するとカクつくので必要な部分だけ)
    updateStatsDisplay();
}

function updateStatsDisplay() {
    const monthCount = calculateMonthTotal(currentHabitId, currentYear, currentMonth);
    monthTotalBadge.textContent = monthCount;
    const activeTabBadge = document.querySelector(`.habit-tab[data-id="${currentHabitId}"] .habit-badge`);
    if (activeTabBadge) {
        activeTabBadge.textContent = monthCount;
    }
}

// 統計・レポート計算
function calculateMonthTotal(habitId, year, month) {
    let count = 0;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const records = appData.records[habitId] || {};

    for (let i = 1; i <= lastDay; i++) {
        const str = formatDate(new Date(year, month, i));
        if (records[str]) count++;
    }
    return count;
}

function calculateStreak(habitId) {
    const records = appData.records[habitId] || {};
    const dates = Object.keys(records).sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    // 今日か昨日がチェックされていなければストリーク切れ
    if (!records[todayStr] && !records[yesterdayStr]) {
        return 0;
    }

    let currentStreak = 0;
    let checkDateObj = new Date(records[todayStr] ? todayStr + 'T00:00:00' : yesterdayStr + 'T00:00:00');

    while (true) {
        const dateStr = formatDate(checkDateObj);
        if (records[dateStr]) {
            currentStreak++;
            checkDateObj.setDate(checkDateObj.getDate() - 1); // 1日前へ
        } else {
            break;
        }
    }
    return currentStreak;
}

function calculateMaxStreak(habitId) {
    const records = appData.records[habitId] || {};
    const dates = Object.keys(records).sort((a, b) => a.localeCompare(b));
    if (dates.length === 0) return 0;

    let max = 0;
    let current = 0;
    let previousDate = null;

    for (const dateStr of dates) {
        const dateObj = new Date(dateStr + 'T00:00:00');
        if (!previousDate) {
            current = 1;
        } else {
            const diffDays = Math.round((dateObj - previousDate) / 86400000);
            if (diffDays === 1) {
                current++;
            } else {
                current = 1; // 途切れたらリセット
            }
        }
        previousDate = dateObj;
        if (current > max) max = current;
    }
    return max;
}

// レポート描画
function renderReport() {
    const container = document.getElementById('report-container');
    container.innerHTML = '';

    if (appData.habits.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; margin-top: 40px;">習慣を追加してください</p>';
        return;
    }

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    appData.habits.forEach(habit => {
        const monthTotal = calculateMonthTotal(habit.id, today.getFullYear(), today.getMonth());
        const currentStreak = calculateStreak(habit.id);
        const maxStreak = Math.max(currentStreak, calculateMaxStreak(habit.id)); // maxStreakには現在のストリークを含める

        const card = document.createElement('div');
        card.className = 'report-card';
        card.innerHTML = `
            <div class="report-habit-name">${escapeHtml(habit.name)}</div>
            <div class="report-stats-grid">
                <div class="report-stat">
                    <span class="report-stat-label">今月の達成</span>
                    <span class="report-stat-value highlight">${monthTotal} <span style="font-size:14px;color:var(--text-secondary)">/ ${daysInMonth}日</span></span>
                </div>
                <div class="report-stat">
                    <span class="report-stat-label">現在の連続記録</span>
                    <span class="report-stat-value">${currentStreak} <span style="font-size:14px;color:var(--text-secondary)">日</span></span>
                </div>
                <div class="report-stat" style="grid-column: span 2;">
                    <span class="report-stat-label">過去最高連続記録</span>
                    <span class="report-stat-value"><i class="fas fa-crown" style="color:#FFD700; margin-right:4px;"></i>${maxStreak} <span style="font-size:14px;color:var(--text-secondary)">日</span></span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// 設定描画
function renderSettings() {
    document.getElementById('setting-theme').value = appData.settings.theme;
    document.getElementById('setting-haptic').checked = appData.settings.haptic;
    document.getElementById('setting-effect-enabled').checked = appData.settings.effectEnabled;
    document.getElementById('setting-effect-type').value = appData.settings.effectType;

    // エフェクトの種類選択の表示/非表示切り替え
    const effectContainer = document.getElementById('effect-type-container');
    effectContainer.style.opacity = appData.settings.effectEnabled ? "1" : "0.5";
    document.getElementById('setting-effect-type').disabled = !appData.settings.effectEnabled;
}

// ナビゲーション切り替え
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-target');

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        views.forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(targetId).classList.add('active');

        // 各ビュー表示時の更新処理
        if (targetId === 'view-report') {
            renderReport();
        } else if (targetId === 'view-settings') {
            renderSettings();
        } else if (targetId === 'view-home') {
            // ホームに戻った時に最新情報を表示
            renderHabitTabs();
            renderCalendar();
        }
    });
});

// テーマ適用
function applyTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);

    // ステータスバーの色（iOS PWA向け）をテーマに合わせる
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.name = "theme-color";
        document.head.appendChild(metaThemeColor);
    }

    const rootStyles = getComputedStyle(document.body);
    const bgColor = rootStyles.getPropertyValue('--bg-color').trim() || '#000000';
    metaThemeColor.content = bgColor;
}

// 演出ロジック (Haptic & エフェクト)
function triggerFeedback() {
    // 振動
    if (appData.settings.haptic && navigator.vibrate) {
        // iOS Safari では navigator.vibrate は非対応のことが多いですが、PWA対応可能な場合やAndroidでは動作します
        navigator.vibrate(50);
    }

    // エフェクト
    if (appData.settings.effectEnabled) {
        const type = appData.settings.effectType;
        playEffect(type);
    }
}

function playEffect(type) {
    if (typeof confetti === 'undefined') return;

    // 絵文字などを使用する場合のヘルパー
    let customShape = null;

    switch (type) {
        case 'confetti':
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
            break;

        case 'fireworks':
            const duration = 2000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#ff0000', '#00ff00', '#0000ff']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#ff0000', '#00ff00', '#0000ff']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
            break;

        case 'sparkles':
            // 🌟
            if (confetti.shapeFromText) {
                customShape = confetti.shapeFromText({ text: '✨', scalar: 2 });
                confetti({
                    shapes: [customShape],
                    particleCount: 40,
                    spread: 80,
                    origin: { y: 0.6 },
                    scalar: 2
                });
            } else {
                confetti({ colors: ['#FFF700', '#FFD700', '#FFF'] });
            }
            break;

        case 'hearts':
            if (confetti.shapeFromText) {
                customShape = confetti.shapeFromText({ text: '💖', scalar: 2 });
                confetti({
                    shapes: [customShape],
                    particleCount: 40,
                    spread: 60,
                    origin: { y: 0.6 }
                });
            } else {
                confetti({ shapes: ['circle'], colors: ['#ffc0cb', '#ff69b4', '#ff1493'] });
            }
            break;

        case 'balloons':
            if (confetti.shapeFromText) {
                customShape = confetti.shapeFromText({ text: '🎈', scalar: 3 });
                confetti({
                    shapes: [customShape],
                    particleCount: 30,
                    spread: 90,
                    origin: { y: 0.8 }
                });
            } else {
                confetti({ shapes: ['circle'], colors: ['#ff0000', '#0000ff', '#ffff00'] });
            }
            break;

        case 'snow':
            const sf_duration = 2000;
            const sf_end = Date.now() + sf_duration;
            let sf_shape = null;
            if (confetti.shapeFromText) {
                sf_shape = confetti.shapeFromText({ text: '❄️', scalar: 1.5 });
            }

            (function snowFrame() {
                confetti({
                    particleCount: 1,
                    startVelocity: 0,
                    ticks: 200,
                    gravity: 0.3,
                    origin: { x: Math.random(), y: Math.random() * 0.2 },
                    colors: ['#ffffff'],
                    shapes: sf_shape ? [sf_shape] : ['circle'],
                    scalar: sf_shape ? 1 : 0.5
                });
                if (Date.now() < sf_end) {
                    requestAnimationFrame(snowFrame);
                }
            }());
            break;
    }
}

// XSS対策
function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// モーダルと追加処理
const addModal = document.getElementById('add-habit-modal');
const inputName = document.getElementById('new-habit-name');

document.getElementById('add-habit-btn').addEventListener('click', () => {
    inputName.value = '';
    addModal.classList.add('show');
    inputName.focus();
});

document.getElementById('btn-cancel-add').addEventListener('click', () => {
    addModal.classList.remove('show');
});

document.getElementById('btn-save-habit').addEventListener('click', () => {
    const name = inputName.value.trim();
    if (name) {
        const newHabit = {
            id: 'habit_' + Date.now(),
            name: name,
            createdAt: new Date().toISOString()
        };
        appData.habits.push(newHabit);
        appData.records[newHabit.id] = {};
        saveData();

        currentHabitId = newHabit.id;
        renderHabitTabs();
        renderCalendar();

        // 最後のタブにスクロール
        setTimeout(() => {
            if (swiperInstance) swiperInstance.slideTo(appData.habits.length - 1);
        }, 100);

        addModal.classList.remove('show');
    }
});

// 編集/削除モーダル
const editModal = document.getElementById('edit-habit-modal');
const editInputName = document.getElementById('edit-habit-name');
let editTargetHabitId = null;

window.openEditModal = function (habit) {
    if (appData.settings.haptic && navigator.vibrate) navigator.vibrate(50);
    editTargetHabitId = habit.id;
    editInputName.value = habit.name;
    editModal.classList.add('show');
};

document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    editModal.classList.remove('show');
});

document.getElementById('btn-save-edit').addEventListener('click', () => {
    const name = editInputName.value.trim();
    if (name && editTargetHabitId) {
        const habit = appData.habits.find(h => h.id === editTargetHabitId);
        if (habit) habit.name = name;
        saveData();
        renderHabitTabs();
        renderReport(); // レポートの表示名も更新
        editModal.classList.remove('show');
    }
});

document.getElementById('btn-delete-habit').addEventListener('click', () => {
    if (appData.habits.length <= 1) {
        alert('最後のカレンダーは削除できません。\nカレンダーが1つの場合は名前の変更のみ可能です。');
        return;
    }
    if (confirm('このカレンダーと記録を削除しますか？\n元には戻せません。')) {
        appData.habits = appData.habits.filter(h => h.id !== editTargetHabitId);
        delete appData.records[editTargetHabitId];

        // 削除したカレンダーを開いていた場合は最初のカレンダーに戻す
        if (currentHabitId === editTargetHabitId) {
            currentHabitId = appData.habits[0].id;
        }

        saveData();
        renderHabitTabs();
        renderCalendar();
        renderReport();
        editModal.classList.remove('show');
    }
});

// 設定のイベントリスナー
document.getElementById('setting-theme').addEventListener('change', (e) => {
    appData.settings.theme = e.target.value;
    applyTheme(e.target.value);
    saveData();
});

document.getElementById('setting-haptic').addEventListener('change', (e) => {
    appData.settings.haptic = e.target.checked;
    saveData();
});

document.getElementById('setting-effect-enabled').addEventListener('change', (e) => {
    appData.settings.effectEnabled = e.target.checked;
    document.getElementById('effect-type-container').style.opacity = e.target.checked ? "1" : "0.5";
    document.getElementById('setting-effect-type').disabled = !e.target.checked;
    saveData();
});

document.getElementById('setting-effect-type').addEventListener('change', (e) => {
    appData.settings.effectType = e.target.value;
    saveData();
    playEffect(e.target.value); // プレビュー
});

document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (confirm('本当にすべてのデータを削除しますか？この操作は元に戻せません。')) {
        appData = { ...DEFAULT_DATA, records: {} };
        // デフォルトを再度生成（IDが変わるように）
        appData.habits = [{ id: 'habit_' + Date.now(), name: '無題のカレンダー', createdAt: new Date().toISOString() }];

        saveData();
        currentHabitId = appData.habits[0].id;

        applyTheme(appData.settings.theme);
        renderHabitTabs();
        renderCalendar();
        renderReport();
        renderSettings();

        alert('データを削除しました。');
    }
});

// スワイプによるカレンダー(習慣)切り替え
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function switchHabit(index) {
    if (index >= 0 && index < appData.habits.length) {
        currentHabitId = appData.habits[index].id;
        updateActiveTab();
        renderCalendar();
        if (swiperInstance) {
            swiperInstance.slideTo(index);
        }
    }
}

function handleSwipeGesture() {
    const swipeThreshold = 40;
    const currentIndex = appData.habits.findIndex(h => h.id === currentHabitId);
    if (currentIndex === -1) return;

    if (touchEndX < touchStartX - swipeThreshold) {
        // 左スワイプ: 次の習慣へ
        switchHabit(currentIndex + 1);
    } else if (touchEndX > touchStartX + swipeThreshold) {
        // 右スワイプ: 前の習慣へ
        switchHabit(currentIndex - 1);
    }
}

// エラーハンドリングなどを付加しつつ初期化
if (monthPicker) {
    monthPicker.addEventListener('change', (e) => {
        if (e.target.value) {
            const [year, month] = e.target.value.split('-');
            currentYear = parseInt(year);
            currentMonth = parseInt(month) - 1;
            renderCalendar();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderHabitTabs();
    renderCalendar();

    // ホーム画面全体でのスワイプイベント登録
    const swipeContainerNode = document.getElementById('view-home');
    if (swipeContainerNode) {
        swipeContainerNode.addEventListener('touchstart', e => {
            if (e.changedTouches) {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
            }
        }, { passive: true });

        swipeContainerNode.addEventListener('touchend', e => {
            if (e.changedTouches) {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;

                // Y軸(縦方向)よりX軸(横方向)の移動距離が大きい場合のみ横スワイプと判定
                if (Math.abs(touchEndX - touchStartX) > Math.abs(touchEndY - touchStartY) && Math.abs(touchEndX - touchStartX) > 40) {
                    handleSwipeGesture();
                }
            }
        }, { passive: true });
    }
});
