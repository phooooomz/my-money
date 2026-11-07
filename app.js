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
        const navRect = nav.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        if (btnRect.width > 0 && navRect.width > 0) {
            indicator.style.width = `${btnRect.width}px`;
            indicator.style.left = `${btnRect.left - navRect.left}px`;
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
}

function clearAllData() {
    if (confirm('คุณต้องการลบข้อมูลรายการทั้งหมดใช่หรือไม่?')) {
        entries = [];
        saveData();
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
async function sendChatMessage(e) {
    if (e) e.preventDefault();
    const chatInput = getEl('chat-input');
    const chatBox = getEl('chat-box');
    const sendBtn = getEl('chat-send-btn');
    if (!chatInput || !chatBox) return;

    const userText = chatInput.value.trim();
    if (!userText) return;

    appendChatMessage('user', userText);
    chatInput.value = '';
    if (sendBtn) sendBtn.disabled = true;

    const loadingId = 'loading-' + Date.now();
    appendChatMessage('ai', 'กำลังคิดคำตอบ...', loadingId);

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
        removeMessage(loadingId);
        if (data.reply) {
            appendChatMessage('ai', data.reply);
        } else {
            appendChatMessage('ai', 'เกิดข้อผิดพลาด: ' + (data.error || 'ไม่สามารถรับข้อมูลได้'));
        }
    } catch (err) {
        removeMessage(loadingId);
        appendChatMessage('ai', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

function appendChatMessage(sender, text, id = null) {
    const chatBox = getEl('chat-box');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    if (id) msgDiv.id = id;
    if (sender === 'user') {
        msgDiv.className = 'bg-[#f0f2f5] text-[#0c0d0e] p-3.5 rounded-2xl max-w-[85%] self-end font-medium shadow-sm';
    } else {
        msgDiv.className = 'bg-[#272a2e]/60 text-[#f0f2f5] p-3.5 rounded-2xl max-w-[85%] self-start border border-white/5 whitespace-pre-wrap leading-relaxed';
    }
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
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
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}
