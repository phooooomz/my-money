// --- STATE MANAGEMENT ---
let entries = JSON.parse(localStorage.getItem('ledger_entries') || '[]');
let currentType = 'income'; // Default to income first
let summaryFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    renderApp();
    registerServiceWorker();
    setupNetworkListeners();
    setTimeout(updateTabIndicator, 50);
    window.addEventListener('resize', updateTabIndicator);
});

function getEl(id) {
    return document.getElementById(id);
}

// Custom Alert Dialog Trigger
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

// Update Active Tab Dynamic Sliding Line/Pill Position
function updateTabIndicator() {
    const activeBtn = document.querySelector('.tab-btn-active');
    const indicator = getEl('tab-indicator');
    const nav = getEl('tab-nav');

    if (activeBtn && indicator && nav) {
        const navRect = nav.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();

        indicator.style.width = `${btnRect.width}px`;
        indicator.style.left = `${btnRect.left - navRect.left}px`;
    }
}

// Tab Switching with Smooth Spring & Sliding Animation
function switchTab(tabName) {
    const tabs = {
        app: { content: getEl('tab-app'), btn: getEl('tab-app-btn') },
        summary: { content: getEl('tab-summary'), btn: getEl('tab-summary-btn') },
        ai: { content: getEl('tab-ai'), btn: getEl('tab-ai-btn') }
    };

    Object.keys(tabs).forEach(key => {
        const item = tabs[key];
        if (!item.content || !item.btn) return;

        if (key === tabName) {
            item.btn.classList.add('tab-btn-active');
            item.content.classList.remove('tab-hidden');
            
            // Trigger entry spring animation
            item.content.classList.remove('tab-entering');
            void item.content.offsetWidth; // Force reflow
            item.content.classList.add('tab-entering');

            if (key === 'summary') renderSummaryTab();
        } else {
            item.btn.classList.remove('tab-btn-active');
            item.content.classList.add('tab-hidden');
            item.content.classList.remove('tab-entering');
        }
    });

    updateTabIndicator();
}

function setDefaultDate() {
    const dateInput = getEl('entry-date');
    if (dateInput && !dateInput.value) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

function saveData() {
    localStorage.setItem('ledger_entries', JSON.stringify(entries));
    renderApp();
}

function setEntryType(type) {
    currentType = type;
    const btnExpense = getEl('type-expense');
    const btnIncome = getEl('type-income');
    
    if (!btnExpense || !btnIncome) return;

    if (type === 'income') {
        btnIncome.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5] transition';
        btnExpense.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5] transition';
    } else {
        btnExpense.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5] transition';
        btnIncome.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5] transition';
    }
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
    const dateVal = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];

    if (!desc || isNaN(amount) || amount <= 0) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกรายละเอียดและจำนวนเงินให้ถูกต้อง', false);
        return;
    }

    const newEntry = {
        id: Date.now().toString(),
        type: currentType,
        category: category,
        desc: desc,
        amount: amount,
        date: dateVal
    };

    entries.unshift(newEntry);
    saveData();

    // Trigger Success Alert Dialog
    const typeText = currentType === 'income' ? 'รายรับ' : 'รายจ่าย';
    showAlert(
        `บันทึก${typeText}สำเร็จ!`, 
        `รายการ "${desc}" จำนวน ฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ถูกบันทึกเรียบร้อยแล้ว`, 
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

    // Render Balances
    const totalBalanceEl = getEl('total-balance');
    const totalIncomeEl = getEl('total-income');
    const totalExpenseEl = getEl('total-expense');

    if (totalBalanceEl) totalBalanceEl.textContent = `฿${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (totalIncomeEl) totalIncomeEl.textContent = `฿${income.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (totalExpenseEl) totalExpenseEl.textContent = `฿${expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    // Render Transaction List
    const listContainer = getEl('transaction-list');
    if (listContainer) {
        if (entries.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-8 text-xs text-[#9ca3af] bg-[#16181a] rounded-2xl border border-[#272a2e]">
                    ยังไม่มีรายการบันทึก
                </div>
            `;
        } else {
            listContainer.innerHTML = entries.map(item => {
                const isExpense = item.type === 'expense';
                const sign = isExpense ? '-' : '+';
                const colorClass = isExpense ? 'text-rose-400' : 'text-emerald-400';
                const displayDate = item.date || 'ไม่ระบุวันที่';
                const categoryTag = item.category || (isExpense ? '📦 รายจ่าย' : '💼 รายรับ');

                return `
                    <div class="bg-[#16181a] border border-[#272a2e] rounded-2xl p-3.5 flex items-center justify-between text-xs md:text-sm hover:border-white/10 transition">
                        <div class="flex items-center gap-3">
                            <span class="text-base bg-[#0c0d0e] px-2.5 py-1.5 rounded-xl border border-[#272a2e]">
                                ${categoryTag.split(' ')[0]}
                            </span>
                            <div class="flex flex-col gap-0.5">
                                <span class="text-[#f0f2f5] font-medium">${escapeHtml(item.desc)}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-[#9ca3af] font-mono">${displayDate}</span>
                                    <span class="text-[10px] text-[#9ca3af]">• ${categoryTag.substring(categoryTag.indexOf(' ') + 1)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="font-mono font-semibold ${colorClass}">
                                ${sign}฿${Number(item.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </span>
                            <button onclick="deleteEntry('${item.id}')" class="text-xs text-[#9ca3af] hover:text-rose-400 transition px-1 py-0.5">
                                ✕
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    renderSummaryTab();
}

function setSummaryFilter(filter) {
    summaryFilter = filter;
    const btnAll = getEl('filter-all');
    const btnMonth = getEl('filter-month');
    const btnWeek = getEl('filter-week');

    const activeClass = 'px-3 py-1 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5] transition';
    const inactiveClass = 'px-3 py-1 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5] transition';

    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnMonth) btnMonth.className = filter === 'month' ? activeClass : inactiveClass;
    if (btnWeek) btnWeek.className = filter === 'week' ? activeClass : inactiveClass;

    renderSummaryTab();
}

function renderSummaryTab() {
    const today = new Date();
    let filteredEntries = [...entries];

    if (summaryFilter === 'month') {
        const currentYearMonth = today.toISOString().slice(0, 7);
        filteredEntries = entries.filter(e => e.date && e.date.startsWith(currentYearMonth));
    } else if (summaryFilter === 'week') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        filteredEntries = entries.filter(e => new Date(e.date) >= sevenDaysAgo);
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
    let incomePct = total > 0 ? (income / total) * 100 : 50;

    const barIncome = getEl('bar-income');
    const barExpense = getEl('bar-expense');
    const ratioText = getEl('summary-ratio-text');
    const incVal = getEl('summary-income-val');
    const expVal = getEl('summary-expense-val');
    const dailyAvg = getEl('daily-avg-expense');
    const totalCountText = getEl('total-count-text');

    if (barIncome) barIncome.style.width = `${incomePct}%`;
    if (barExpense) barExpense.style.width = `${100 - incomePct}%`;
    if (ratioText) ratioText.textContent = `${incomePct.toFixed(1)}% รายรับ`;
    if (incVal) incVal.textContent = `รายรับ: ฿${income.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (expVal) expVal.textContent = `รายจ่าย: ฿${expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    const uniqueDays = new Set(filteredEntries.map(e => e.date)).size || 1;
    const avg = expense / uniqueDays;
    if (dailyAvg) dailyAvg.textContent = `฿${avg.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (totalCountText) totalCountText.textContent = `${filteredEntries.length} รายการ`;

    // Category Breakdown rendering
    const catContainer = getEl('category-breakdown-list');
    if (catContainer) {
        const sortedCategories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);

        if (sortedCategories.length === 0) {
            catContainer.innerHTML = `<div class="text-xs text-[#9ca3af] py-2">ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</div>`;
        } else {
            catContainer.innerHTML = sortedCategories.map(cat => {
                const amount = categoryTotals[cat];
                const pct = expense > 0 ? ((amount / expense) * 100).toFixed(1) : 0;

                return `
                    <div class="flex flex-col gap-1 py-1.5 border-b border-[#272a2e]/40 last:border-0 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="text-[#f0f2f5] font-medium">${cat}</span>
                            <span class="font-mono text-rose-400 font-semibold">฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${pct}%)</span>
                        </div>
                        <div class="w-full bg-[#0c0d0e] h-1.5 rounded-full overflow-hidden">
                            <div class="bg-rose-400 h-full rounded-full" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

async function sendChatMessage(e) {
    e.preventDefault();
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

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

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