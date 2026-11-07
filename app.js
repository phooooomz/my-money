// --- STATE MANAGEMENT ---
const STORAGE_KEY = 'ledger_entries';

function loadEntries() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

let entries = loadEntries();
let currentType = 'income';
let summaryFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    renderApp();
    registerServiceWorker();
    setupNetworkListeners();
    syncSummarySnapshot();
    renderNotifyUI();
    startReminderLoop();
    document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { closeNotifyModal(); closeCustomAlert(); }
    });
    // Ensure initial tab highlight is rendered reliably
    setTimeout(updateTabIndicator, 50);
    setTimeout(updateTabIndicator, 300);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateTabIndicator);
    window.addEventListener('resize', updateTabIndicator);
});

// --- HELPERS ---
function getEl(id) {
    return document.getElementById(id);
}

// วันที่แบบ YYYY-MM-DD ตามเวลาเครื่อง (toISOString ใช้ UTC ทำให้ช่วง 00:00-07:00 ของไทยได้วันที่เมื่อวาน)
function localDateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
    return '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str ?? '').replace(/[&<>"']/g, m => map[m]);
}

// --- ALERT MODAL ---
function showAlert(title, message, isSuccess = true) {
    const modal = getEl('custom-alert');
    const titleEl = getEl('alert-title');
    const msgEl = getEl('alert-message');
    const iconContainer = getEl('alert-icon-container');
    if (!modal || !titleEl || !msgEl || !iconContainer) return;
    titleEl.textContent = title;
    msgEl.textContent = message;
    if (isSuccess) {
        iconContainer.className = "w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl shadow-inner";
        iconContainer.textContent = "✓";
    } else {
        iconContainer.className = "w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-2xl shadow-inner";
        iconContainer.textContent = "⚠️";
    }
    modal.classList.add('alert-show');
}

function closeCustomAlert() {
    const modal = getEl('custom-alert');
    if (modal) modal.classList.remove('alert-show');
}

function submitFeedbackTab(e) {
    if (e) e.preventDefault();
    const typeEl = getEl('feedback-tab-type');
    const textEl = getEl('feedback-tab-text');
    if (!textEl || !textEl.value.trim()) return;
    const typeText = typeEl ? typeEl.value : '';
    showAlert('ขอบคุณสำหรับข้อเสนอแนะ!', `เราได้รับข้อมูล (${typeText}) เรียบร้อยแล้ว ขอบคุณที่ช่วยพัฒนาแอปครับ`, true);
    textEl.value = '';
}

// --- TABS ---
// Calibrated Active Tab Dynamic Elastic Pill Indicator (Centered Precision & Overflow Proof)
function updateTabIndicator() {
    const activeBtn = document.querySelector('.tab-btn-active');
    const indicator = getEl('tab-indicator');
    const nav = getEl('tab-nav');
    if (activeBtn && indicator && nav) {
        // indicator ถูกวางแบบ absolute ใน container (ที่มี padding + border) ไม่ใช่ใน nav
        // จึงต้องวัดตำแหน่งเทียบกับ container เดียวกับที่ indicator อ้างอิงอยู่
        const container = indicator.offsetParent || nav.parentElement;
        const containerRect = container.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        if (btnRect.width > 0 && containerRect.width > 0) {
            indicator.style.width = `${btnRect.width}px`;
            indicator.style.left = `${btnRect.left - containerRect.left - container.clientLeft}px`;
        }
    }
}

// Core Tab Switcher Function
function switchTab(tabName) {
    const tabs = {
        app: { content: getEl('tab-app'), btn: getEl('tab-app-btn') },
        summary: { content: getEl('tab-summary'), btn: getEl('tab-summary-btn') },
        ai: { content: getEl('tab-ai'), btn: getEl('tab-ai-btn') },
        feedback: { content: getEl('tab-feedback'), btn: getEl('tab-feedback-btn') }
    };
    Object.keys(tabs).forEach(key => {
        const item = tabs[key];
        if (!item.content || !item.btn) return;
        if (key === tabName) {
            item.btn.classList.add('tab-btn-active');
            item.content.classList.remove('tab-hidden');
            item.content.classList.remove('tab-entering');
            void item.content.offsetWidth;
            item.content.classList.add('tab-entering');
            if (key === 'summary') renderSummaryTab();
        } else {
            item.btn.classList.remove('tab-btn-active');
            item.content.classList.add('tab-hidden');
            item.content.classList.remove('tab-entering');
        }
    });
    requestAnimationFrame(updateTabIndicator);
}

// --- ENTRIES ---
function setDefaultDate() {
    const dateInput = getEl('entry-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = localDateStr();
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
        showAlert('บันทึกไม่สำเร็จ', 'พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็มหรือถูกปิดการใช้งาน', false);
    }
    syncSummarySnapshot();
    renderApp();
}

function setEntryType(type) {
    currentType = type;
    const btnExpense = getEl('type-expense');
    const btnIncome = getEl('type-income');
    if (!btnExpense || !btnIncome) return;
    const activeClass = 'btn-dark-bounce flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5]';
    const inactiveClass = 'btn-dark-bounce flex-1 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5]';
    btnIncome.className = type === 'income' ? activeClass : inactiveClass;
    btnExpense.className = type === 'income' ? inactiveClass : activeClass;
}

function addEntry() {
    const dateInput = getEl('entry-date');
    const categoryInput = getEl('entry-category');
    const descInput = getEl('entry-desc');
    const amountInput = getEl('entry-amount');
    if (!descInput || !amountInput || !categoryInput) return;

    const desc = descInput.value.trim();
    const category = categoryInput.value;
    const amount = parseFloat(amountInput.value);
    const dateVal = dateInput && dateInput.value ? dateInput.value : localDateStr();

    if (!desc || isNaN(amount) || amount <= 0) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกรายละเอียดและจำนวนเงินให้ถูกต้อง', false);
        return;
    }

    const newEntry = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        type: currentType,
        category: category,
        desc: desc,
        amount: amount,
        date: dateVal
    };

    entries.unshift(newEntry);
    saveData();

    const typeText = currentType === 'income' ? 'รายรับ' : 'รายจ่าย';
    showAlert(
        `บันทึก${typeText}สำเร็จ!`,
        `รายการ "${desc}" จำนวน ${fmtMoney(amount)} ถูกบันทึกเรียบร้อยแล้ว`,
        true
    );

    descInput.value = '';
    amountInput.value = '';
    setDefaultDate();
}

function deleteEntry(id) {
    entries = entries.filter(item => item.id !== id);
    saveData();
    showToast('ลบรายการแล้ว', 'info', 2200);
}

function clearAllData() {
    if (confirm('คุณต้องการลบข้อมูลรายการทั้งหมดใช่หรือไม่?')) {
        entries = [];
        saveData();
        showToast('ลบข้อมูลทั้งหมดแล้ว', 'info', 2500);
    }
}

// --- RENDER: MAIN TAB ---
function renderApp() {
    let income = 0;
    let expense = 0;
    entries.forEach(item => {
        const val = Number(item.amount) || 0;
        if (item.type === 'income') {
            income += val;
        } else {
            expense += val;
        }
    });
    const balance = income - expense;

    const totalBalanceEl = getEl('total-balance');
    const totalIncomeEl = getEl('total-income');
    const totalExpenseEl = getEl('total-expense');
    if (totalBalanceEl) totalBalanceEl.textContent = fmtMoney(balance);
    if (totalIncomeEl) totalIncomeEl.textContent = fmtMoney(income);
    if (totalExpenseEl) totalExpenseEl.textContent = fmtMoney(expense);

    const listContainer = getEl('transaction-list');
    if (listContainer) {
        if (entries.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-8 text-xs text-[#9ca3af] bg-[#16181a] rounded-2xl border border-[#272a2e]">ยังไม่มีรายการบันทึก</div>`;
        } else {
            listContainer.innerHTML = entries.map(item => {
                const isExpense = item.type === 'expense';
                const sign = isExpense ? '-' : '+';
                const colorClass = isExpense ? 'text-rose-400' : 'text-emerald-400';
                const displayDate = item.date || 'ไม่ระบุวันที่';
                const categoryTag = String(item.category || (isExpense ? '📦 รายจ่าย' : '💼 รายรับ'));
                const icon = categoryTag.split(' ')[0];
                const label = categoryTag.substring(categoryTag.indexOf(' ') + 1);
                return `<div class="bg-[#16181a] border border-[#272a2e] rounded-2xl p-3.5 flex items-center justify-between text-xs md:text-sm hover:border-white/10 transition">
<div class="flex items-center gap-3">
<span class="text-base bg-[#0c0d0e] px-2.5 py-1.5 rounded-xl border border-[#272a2e]">${escapeHtml(icon)}</span>
<div class="flex flex-col gap-0.5">
<span class="text-[#f0f2f5] font-medium">${escapeHtml(item.desc)}</span>
<div class="flex items-center gap-2">
<span class="text-[10px] text-[#9ca3af] font-mono">${escapeHtml(displayDate)}</span>
<span class="text-[10px] text-[#9ca3af]">• ${escapeHtml(label)}</span>
</div>
</div>
</div>
<div class="flex items-center gap-3">
<span class="font-mono font-semibold ${colorClass}">${sign}${fmtMoney(item.amount)}</span>
<button type="button" onclick="deleteEntry('${escapeHtml(item.id)}')" class="text-xs text-[#9ca3af] hover:text-rose-400 transition px-1 py-0.5">✕</button>
</div>
</div>`;
            }).join('');
        }
    }
    renderSummaryTab();
}

// --- SUMMARY TAB ---
function setSummaryFilter(filter) {
    summaryFilter = filter;
    const btnAll = getEl('filter-all');
    const btnMonth = getEl('filter-month');
    const btnWeek = getEl('filter-week');
    const activeClass = 'btn-dark-bounce px-3 py-1 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5]';
    const inactiveClass = 'btn-dark-bounce px-3 py-1 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5]';
    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnMonth) btnMonth.className = filter === 'month' ? activeClass : inactiveClass;
    if (btnWeek) btnWeek.className = filter === 'week' ? activeClass : inactiveClass;
    renderSummaryTab();
}

function renderSummaryTab() {
    const today = new Date();
    let filteredEntries = [...entries];

    if (summaryFilter === 'month') {
        const currentYearMonth = localDateStr(today).slice(0, 7);
        filteredEntries = entries.filter(e => e.date && e.date.startsWith(currentYearMonth));
    } else if (summaryFilter === 'week') {
        // 7 วันล่าสุด รวมวันนี้ (เทียบเป็นข้อความ YYYY-MM-DD เพื่อเลี่ยงปัญหา timezone)
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        const startStr = localDateStr(start);
        filteredEntries = entries.filter(e => e.date && e.date >= startStr);
    }

    let income = 0;
    let expense = 0;
    const categoryTotals = {};
    filteredEntries.forEach(item => {
        const val = Number(item.amount) || 0;
        if (item.type === 'income') {
            income += val;
        } else {
            expense += val;
            const cat = item.category || '📦 อื่นๆ';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + val;
        }
    });

    const total = income + expense;
    const incomePct = total > 0 ? (income / total) * 100 : 50;

    const barIncome = getEl('bar-income');
    const barExpense = getEl('bar-expense');
    const ratioText = getEl('summary-ratio-text');
    const incVal = getEl('summary-income-val');
    const expVal = getEl('summary-expense-val');
    const dailyAvg = getEl('daily-avg-expense');
    const totalCountText = getEl('total-count-text');

    if (barIncome) barIncome.style.width = `${incomePct}%`;
    if (barExpense) barExpense.style.width = `${100 - incomePct}%`;
    if (ratioText) ratioText.textContent = `${(total > 0 ? incomePct : 0).toFixed(1)}% รายรับ`;
    if (incVal) incVal.textContent = `รายรับ: ${fmtMoney(income)}`;
    if (expVal) expVal.textContent = `รายจ่าย: ${fmtMoney(expense)}`;

    const uniqueDays = new Set(filteredEntries.map(e => e.date)).size || 1;
    const avg = expense / uniqueDays;
    if (dailyAvg) dailyAvg.textContent = fmtMoney(avg);
    if (totalCountText) totalCountText.textContent = `${filteredEntries.length} รายการ`;

    const catContainer = getEl('category-breakdown-list');
    if (catContainer) {
        const sortedCategories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        if (sortedCategories.length === 0) {
            catContainer.innerHTML = `<div class="text-xs text-[#9ca3af] py-2">ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</div>`;
        } else {
            catContainer.innerHTML = sortedCategories.map(cat => {
                const amount = categoryTotals[cat];
                const pct = expense > 0 ? ((amount / expense) * 100).toFixed(1) : '0.0';
                return `<div class="flex flex-col gap-1 py-1.5 border-b border-[#272a2e]/40 last:border-0 text-xs">
<div class="flex items-center justify-between">
<span class="text-[#f0f2f5] font-medium">${escapeHtml(cat)}</span>
<span class="font-mono text-rose-400 font-semibold">${fmtMoney(amount)} (${pct}%)</span>
</div>
<div class="w-full bg-[#0c0d0e] h-1.5 rounded-full overflow-hidden">
<div class="bg-rose-400 h-full rounded-full" style="width: ${pct}%;"></div>
</div>
</div>`;
            }).join('');
        }
    }
}

// --- AI CHAT ---
let chatBusy = false;

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollChat() {
    const chatBox = getEl('chat-box');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendChatMessage(e) {
    if (e) e.preventDefault();
    const chatInput = getEl('chat-input');
    const chatBox = getEl('chat-box');
    const sendBtn = getEl('chat-send-btn');
    if (!chatInput || !chatBox || chatBusy) return;

    const userText = chatInput.value.trim();
    if (!userText) return;

    chatBusy = true;
    appendChatMessage('user', userText);
    chatInput.value = '';
    if (sendBtn) sendBtn.disabled = true;

    const loadingId = 'loading-' + Date.now();
    appendTypingIndicator(loadingId);

    try {
        let reply = null;
        let errorText = null;
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userText,
                    records: entries
                })
            });
            const data = await response.json();
            if (data.reply) {
                reply = data.reply;
            } else {
                errorText = 'เกิดข้อผิดพลาด: ' + (data.error || 'ไม่สามารถรับข้อมูลได้');
            }
        } catch (err) {
            errorText = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
        }

        removeMessage(loadingId);
        if (reply) {
            notifyAiReply(reply);
            await typeChatMessage(reply);
        } else {
            appendChatMessage('ai', errorText);
        }
    } finally {
        removeMessage(loadingId);
        chatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function appendChatMessage(sender, text, id = null) {
    const chatBox = getEl('chat-box');
    if (!chatBox) return null;
    const msgDiv = document.createElement('div');
    if (id) msgDiv.id = id;
    if (sender === 'user') {
        msgDiv.className = 'chat-msg-in chat-msg-user bg-[#f0f2f5] text-[#0c0d0e] p-3.5 rounded-2xl max-w-[85%] self-end font-medium shadow-sm';
    } else {
        msgDiv.className = 'chat-msg-in chat-msg-ai bg-[#272a2e]/60 text-[#f0f2f5] p-3.5 rounded-2xl max-w-[85%] self-start border border-white/5 whitespace-pre-wrap leading-relaxed';
    }
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    scrollChat();
    return msgDiv;
}

// จุดสามจุดเด้งๆ ขณะรอ AI ตอบ
function appendTypingIndicator(id) {
    const chatBox = getEl('chat-box');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.setAttribute('aria-label', 'AI กำลังพิมพ์');
    msgDiv.className = 'chat-msg-in chat-msg-ai bg-[#272a2e]/60 text-[#f0f2f5] px-4 py-3.5 rounded-2xl self-start border border-white/5';
    msgDiv.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    chatBox.appendChild(msgDiv);
    scrollChat();
}

// ข้อความ AI ค่อยๆ พิมพ์ออกมาทีละตัว (เวลารวมไม่เกิน ~3 วินาที)
function typeChatMessage(text) {
    return new Promise(resolve => {
        const el = appendChatMessage('ai', '');
        if (!el) return resolve(null);
        if (prefersReducedMotion() || document.hidden || text.length < 2) {
            el.textContent = text;
            scrollChat();
            return resolve(el);
        }
        const chars = Array.from(text);
        const total = chars.length;
        const duration = Math.min(3000, Math.max(600, total * 18));
        const start = performance.now();
        el.classList.add('type-caret');
        function frame(now) {
            const progress = Math.min(1, (now - start) / duration);
            if (progress < 1) {
                el.textContent = chars.slice(0, Math.floor(total * progress)).join('');
                scrollChat();
                requestAnimationFrame(frame);
            } else {
                el.textContent = text;
                el.classList.remove('type-caret');
                scrollChat();
                resolve(el);
            }
        }
        requestAnimationFrame(frame);
    });
}

function isAiTabVisible() {
    const t = getEl('tab-ai');
    return !!t && !t.classList.contains('tab-hidden');
}

// แจ้งผู้ใช้เมื่อ AI ตอบ ในกรณีที่ไม่ได้ดูหน้าแชตอยู่
function notifyAiReply(text) {
    const preview = String(text).replace(/\s+/g, ' ').slice(0, 90);
    if (document.hidden) {
        if (notifySettings.enabled) showSystemNotification('🤖 AI ตอบแล้ว', preview, 'ai-reply');
        return;
    }
    if (!isAiTabVisible()) {
        showToast('🤖 AI ตอบแล้ว แตะเพื่อดูคำตอบ', 'info', 4500, () => switchTab('ai'));
    }
}

function removeMessage(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

// --- PWA / NETWORK ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW bypassed:', err));
    }
}

function setupNetworkListeners() {
    const updateOnlineStatus = () => {
        const statusBadge = getEl('network-status');
        const statusDot = getEl('network-dot');
        const statusText = getEl('network-text');
        if (!statusBadge || !statusDot || !statusText) return;
        if (navigator.onLine) {
            statusBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full border bg-emerald-950/40 border-emerald-900/60 text-emerald-400 text-xs transition-colors duration-300";
            statusDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
            statusText.textContent = "Online";
        } else {
            statusBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full border bg-rose-950/40 border-rose-900/60 text-rose-400 text-xs transition-colors duration-300";
            statusDot.className = "w-2 h-2 rounded-full bg-rose-500";
            statusText.textContent = "Offline";
        }
    };
    window.addEventListener('online', () => { updateOnlineStatus(); showToast('กลับมาออนไลน์แล้ว', 'success'); });
    window.addEventListener('offline', () => { updateOnlineStatus(); showToast('ออฟไลน์อยู่ ใช้ AI ไม่ได้ แต่ยังบันทึกบัญชีได้', 'error', 4000); });
    updateOnlineStatus();
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info', duration = 3200, onClick = null) {
    const container = getEl('toast-container');
    if (!container) return;

    const styles = {
        success: { icon: '✓', border: 'border-emerald-500/30', color: 'text-emerald-400' },
        error: { icon: '⚠️', border: 'border-rose-500/30', color: 'text-rose-400' },
        info: { icon: '🔔', border: 'border-[#38C6FF]/30', color: 'text-[#38C6FF]' }
    };
    const st = styles[type] || styles.info;

    // แสดงพร้อมกันไม่เกิน 3 อัน
    while (container.children.length >= 3) container.firstElementChild.remove();

    const toast = document.createElement('div');
    toast.className = `toast-in pointer-events-auto flex items-center gap-3 bg-[#16181a]/95 backdrop-blur border ${st.border} rounded-2xl px-4 py-3 shadow-2xl text-xs ${onClick ? 'cursor-pointer' : ''}`;
    const icon = document.createElement('span');
    icon.className = `text-base ${st.color}`;
    icon.textContent = st.icon;
    const msg = document.createElement('span');
    msg.className = 'text-[#f0f2f5] leading-relaxed';
    msg.textContent = message;
    toast.append(icon, msg);

    let closed = false;
    const dismiss = () => {
        if (closed) return;
        closed = true;
        toast.classList.remove('toast-in');
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', () => {
        if (onClick) onClick();
        dismiss();
    });
    container.appendChild(toast);
    setTimeout(dismiss, duration);
}

// --- BROWSER NOTIFICATIONS (ทำงานบนอุปกรณ์นี้) ---
const NOTIFY_KEY = 'notify_settings';

function loadNotifySettings() {
    const defaults = { enabled: false, push: false, time: '18:00', lastSent: '' };
    try {
        const raw = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
        return { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch (e) {
        return defaults;
    }
}

let notifySettings = loadNotifySettings();

function saveNotifySettings() {
    try {
        localStorage.setItem(NOTIFY_KEY, JSON.stringify(notifySettings));
    } catch (e) { /* ignore */ }
}

function notificationsSupported() {
    return 'Notification' in window;
}

async function showSystemNotification(title, body, tag = 'my-money') {
    if (!notificationsSupported() || Notification.permission !== 'granted') return false;
    const options = { body, icon: '/icon-192.png', badge: '/icon-192.png', tag, renotify: true, data: { url: '/' } };
    try {
        // มือถือ Android ต้องแสดงผ่าน Service Worker
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.showNotification(title, options);
                return true;
            }
        }
        new Notification(title, options);
        return true;
    } catch (e) {
        console.log('Notification failed:', e);
        return false;
    }
}

function buildDailySummary() {
    const todayStr = localDateStr();
    const todays = entries.filter(e => e.date === todayStr);
    if (todays.length === 0) {
        return { title: '📝 อย่าลืมบันทึกบัญชีวันนี้', body: 'วันนี้ยังไม่มีรายการ แตะเพื่อเริ่มบันทึกได้เลย' };
    }
    let income = 0;
    let expense = 0;
    todays.forEach(e => {
        const v = Number(e.amount) || 0;
        if (e.type === 'income') income += v; else expense += v;
    });
    return {
        title: '📊 สรุปบัญชีวันนี้',
        body: `รายรับ ${fmtMoney(income)} • รายจ่าย ${fmtMoney(expense)} • คงเหลือ ${fmtMoney(income - expense)} (${todays.length} รายการ)`
    };
}

function reminderDueDate(now = new Date()) {
    const [h, m] = String(notifySettings.time || '18:00').split(':').map(Number);
    const due = new Date(now);
    due.setHours(h || 0, m || 0, 0, 0);
    return due;
}

// ตั้งฐานเวลาใหม่: ถ้าเวลาเตือนวันนี้ผ่านไปแล้ว ให้เริ่มเตือนครั้งแรกวันพรุ่งนี้ (กันเด้งทันทีตอนเปิดใช้งาน)
function resetReminderBaseline() {
    const now = new Date();
    notifySettings.lastSent = now >= reminderDueDate(now) ? localDateStr(now) : '';
}

async function checkDailyReminder() {
    if (!notifySettings.enabled || notifySettings.push || !notificationsSupported() || Notification.permission !== 'granted') return;
    const now = new Date();
    const today = localDateStr(now);
    if (notifySettings.lastSent === today || now < reminderDueDate(now)) return;
    notifySettings.lastSent = today;
    saveNotifySettings();
    const summary = buildDailySummary();
    await showSystemNotification(summary.title, summary.body, 'daily-summary');
}

function startReminderLoop() {
    checkDailyReminder();
    setInterval(checkDailyReminder, 30000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkDailyReminder();
    });
    // ซิงก์การสมัคร Push กับเซิร์ฟเวอร์ (และอัปเกรดจากโหมดในเครื่องอัตโนมัติ ถ้าตั้งค่าเซิร์ฟเวอร์เสร็จแล้ว)
    if (notifySettings.enabled && pushSupported() && Notification.permission === 'granted') {
        subscribePush(!notifySettings.push).then(ok => {
            if (ok && !notifySettings.push) {
                notifySettings.push = true;
                saveNotifySettings();
                renderNotifyUI();
            }
        });
    }
}

function renderNotifyUI() {
    const supported = notificationsSupported();
    const granted = supported && Notification.permission === 'granted';
    const active = notifySettings.enabled && granted;

    const toggle = getEl('notify-toggle');
    const timeInput = getEl('notify-time');
    const status = getEl('notify-status');
    const bellIcon = getEl('notify-bell-icon');
    const bellDot = getEl('notify-bell-dot');

    if (toggle) toggle.setAttribute('aria-checked', active ? 'true' : 'false');
    if (timeInput) {
        timeInput.value = notifySettings.time;
        timeInput.disabled = !active;
        timeInput.classList.toggle('opacity-50', !active);
    }
    if (status) {
        if (!supported) status.textContent = 'เบราว์เซอร์นี้ไม่รองรับ';
        else if (Notification.permission === 'denied') status.textContent = 'ถูกบล็อก (เปิดได้ที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์)';
        else status.textContent = active
            ? `เปิดอยู่ • เตือนทุกวัน ${notifySettings.time} น.${notifySettings.push ? ' • Push' : ''}`
            : 'ปิดอยู่';
    }
    const note = getEl('notify-note');
    if (note) {
        note.textContent = active && notifySettings.push
            ? 'ส่งผ่านเซิร์ฟเวอร์ (Web Push) จึงเตือนได้แม้ปิดแอป ตัวเลขสรุปคำนวณบนเครื่องของคุณ ไม่ถูกส่งออกไป'
            : 'โหมดในเครื่อง: เตือนเมื่อแอปเปิดอยู่ (รวมถึงอยู่เบื้องหลัง) หากปิดแอปไปแล้วจะเตือนเมื่อเปิดแอปครั้งถัดไป';
    }
    if (bellIcon) bellIcon.textContent = active ? '🔔' : '🔕';
    if (bellDot) bellDot.classList.toggle('hidden', !active);
}

let notifyBusy = false;

async function toggleNotifications() {
    if (notifyBusy) return;
    notifyBusy = true;
    try {
        if (notifySettings.enabled) {
            notifySettings.enabled = false;
            notifySettings.push = false;
            saveNotifySettings();
            renderNotifyUI();
            unsubscribePush();
            showToast('ปิดการแจ้งเตือนแล้ว', 'info', 2200);
            return;
        }
        if (!notificationsSupported()) {
            showToast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน (บน iPhone ต้องกด "เพิ่มไปยังหน้าจอโฮม" ก่อน)', 'error', 5500);
            return;
        }
        let perm = Notification.permission;
        if (perm === 'default') {
            try { perm = await Notification.requestPermission(); } catch (e) { /* ignore */ }
        }
        if (perm !== 'granted') {
            renderNotifyUI();
            showToast(perm === 'denied'
                ? 'การแจ้งเตือนถูกบล็อก กรุณาเปิดที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์'
                : 'ยังไม่ได้อนุญาตการแจ้งเตือน', 'error', 5000);
            return;
        }
        notifySettings.enabled = true;
        resetReminderBaseline();
        const pushOk = pushSupported() ? await subscribePush(true) : false;
        notifySettings.push = pushOk;
        saveNotifySettings();
        renderNotifyUI();
        showToast(pushOk
            ? `เปิดแล้ว เตือนทุกวัน ${notifySettings.time} น. แม้ปิดแอป`
            : `เปิดแล้ว (โหมดในเครื่อง) เตือนทุกวัน ${notifySettings.time} น. ขณะเปิดแอป`, 'success', pushOk ? 3200 : 5000);
        const bell = getEl('notify-bell');
        if (bell) {
            bell.classList.remove('bell-ring');
            void bell.offsetWidth;
            bell.classList.add('bell-ring');
        }
    } finally {
        notifyBusy = false;
    }
}

async function setReminderTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return;
    notifySettings.time = value;
    resetReminderBaseline();
    saveNotifySettings();
    renderNotifyUI();
    showToast(`ตั้งเวลาเตือนเป็น ${value} น. แล้ว`, 'success', 2500);
    if (notifySettings.enabled && notifySettings.push) {
        const ok = await subscribePush(true);
        if (!ok) showToast('อัปเดตเวลาไปที่เซิร์ฟเวอร์ไม่สำเร็จ จะลองใหม่เมื่อเปิดแอปครั้งหน้า', 'error', 4500);
    }
}

async function sendTestNotification() {
    if (!notificationsSupported() || Notification.permission !== 'granted') {
        showToast('กรุณาเปิดการแจ้งเตือนก่อน', 'error');
        return;
    }
    // โหมด Push: ให้เซิร์ฟเวอร์ส่งมาจริง เพื่อทดสอบทั้งระบบ
    if (notifySettings.push && pushSupported()) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = reg && await reg.pushManager.getSubscription();
            if (sub) {
                const res = await fetch('/api/push', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) showToast('ส่ง Push ทดสอบแล้ว รอสักครู่...', 'success');
                else showToast('Push ไม่สำเร็จ: ' + (data.error || res.status), 'error', 5500);
                return;
            }
        } catch (e) { /* ใช้การทดสอบในเครื่องแทน */ }
    }
    const summary = buildDailySummary();
    const ok = await showSystemNotification(summary.title, summary.body, 'test');
    showToast(ok ? 'ส่งการแจ้งเตือนทดสอบแล้ว' : 'ส่งการแจ้งเตือนไม่สำเร็จ', ok ? 'success' : 'error');
}

// --- WEB PUSH (ผ่าน Cloudflare) ---
function urlBase64ToUint8Array(b64) {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && notificationsSupported();
}

async function getReadyRegistration() {
    await navigator.serviceWorker.register('/sw.js');
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('service worker timeout')), 8000))
    ]);
}

// สมัคร/อัปเดต Push กับเซิร์ฟเวอร์ คืน true ถ้าสำเร็จ
async function subscribePush(withBaseline) {
    if (!pushSupported()) return false;
    try {
        const reg = await getReadyRegistration();
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const keyRes = await fetch('/api/push');
            if (!keyRes.ok) return false; // เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ใช้โหมดในเครื่องแทน
            const { publicKey } = await keyRes.json();
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        const payload = {
            endpoint: sub.endpoint,
            time: notifySettings.time,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok'
        };
        if (withBaseline) payload.lastSent = notifySettings.lastSent;
        const res = await fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch (e) {
        console.log('Push subscribe failed:', e);
        return false;
    }
}

async function unsubscribePush() {
    try {
        if (!pushSupported()) return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch('/api/push', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint })
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
    } catch (e) {
        console.log('Push unsubscribe failed:', e);
    }
}

// เก็บสรุปรายการแบบย่อไว้ใน Cache Storage เพื่อให้ Service Worker สร้างข้อความ push ได้ (อยู่บนเครื่องเท่านั้น)
async function syncSummarySnapshot() {
    if (!('caches' in window)) return;
    try {
        const slim = entries.map(e => ({ date: e.date, type: e.type, amount: Number(e.amount) || 0 }));
        const cache = await caches.open('my-money-data');
        await cache.put('/__summary.json', new Response(JSON.stringify(slim), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) { /* ignore */ }
}

function openNotifyModal() {
    renderNotifyUI();
    const modal = getEl('notify-modal');
    if (modal) modal.classList.add('alert-show');
}

function closeNotifyModal() {
    const modal = getEl('notify-modal');
    if (modal) modal.classList.remove('alert-show');
}