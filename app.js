// --- STATE MANAGEMENT ---
let entries = JSON.parse(localStorage.getItem('ledger_entries') || '[]');
let currentType = 'expense';

document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    renderApp();
    registerServiceWorker();
    setupNetworkListeners();
});

function getEl(id) {
    return document.getElementById(id);
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

    if (type === 'expense') {
        btnExpense.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5] transition';
        btnIncome.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5] transition';
    } else {
        btnIncome.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#272a2e] text-[#f0f2f5] transition';
        btnExpense.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f0f2f5] transition';
    }
}

function addEntry() {
    const dateInput = getEl('entry-date');
    const descInput = getEl('entry-desc');
    const amountInput = getEl('entry-amount');

    if (!descInput || !amountInput) return;

    const desc = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const dateVal = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];

    if (!desc || isNaN(amount) || amount <= 0) {
        alert('กรุณากรอกรายละเอียดและจำนวนเงินให้ถูกต้อง');
        return;
    }

    const newEntry = {
        id: Date.now().toString(),
        type: currentType,
        desc: desc,
        amount: amount,
        date: dateVal
    };

    entries.unshift(newEntry);
    saveData();

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
        if (item.type === 'income') income += val;
        else expense += val;
    });

    const balance = income - expense;

    const totalBalanceEl = getEl('total-balance');
    const totalIncomeEl = getEl('total-income');
    const totalExpenseEl = getEl('total-expense');

    if (totalBalanceEl) totalBalanceEl.textContent = `฿${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (totalIncomeEl) totalIncomeEl.textContent = `฿${income.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (totalExpenseEl) totalExpenseEl.textContent = `฿${expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    const listContainer = getEl('transaction-list');
    if (!listContainer) return;

    if (entries.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8 text-xs text-[#9ca3af] bg-[#16181a] rounded-xl border border-[#272a2e]">
                ยังไม่มีรายการบันทึก
            </div>
        `;
        return;
    }

    listContainer.innerHTML = entries.map(item => {
        const isExpense = item.type === 'expense';
        const sign = isExpense ? '-' : '+';
        const colorClass = isExpense ? 'text-rose-400' : 'text-emerald-400';
        const displayDate = item.date || 'ไม่ระบุวันที่';

        return `
            <div class="bg-[#16181a] border border-[#272a2e] rounded-xl p-3 flex items-center justify-between text-sm">
                <div class="flex flex-col">
                    <span class="text-[#f0f2f5] font-medium">${escapeHtml(item.desc)}</span>
                    <span class="text-[10px] text-[#9ca3af] font-mono mt-0.5">${displayDate}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-mono font-medium ${colorClass}">
                        ${sign}฿${Number(item.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                    <button onclick="deleteEntry('${item.id}')" class="text-xs text-[#9ca3af] hover:text-rose-400 transition px-1">
                        ✕
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function switchTab(tabName) {
    const appTab = getEl('tab-app');
    const aiTab = getEl('tab-ai');
    const appBtn = getEl('tab-app-btn');
    const aiBtn = getEl('tab-ai-btn');

    if (!appTab || !aiTab || !appBtn || !aiBtn) return;

    if (tabName === 'app') {
        appTab.classList.remove('hidden');
        aiTab.classList.add('hidden');
        appBtn.className = 'pb-2 tab-active transition-colors';
        aiBtn.className = 'pb-2 text-[#9ca3af] hover:text-[#f0f2f5] transition-colors';
    } else {
        appTab.classList.add('hidden');
        aiTab.classList.remove('hidden');
        aiBtn.className = 'pb-2 tab-active transition-colors';
        appBtn.className = 'pb-2 text-[#9ca3af] hover:text-[#f0f2f5] transition-colors';
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
        msgDiv.className = 'bg-[#f0f2f5] text-[#0c0d0e] p-3 rounded-xl max-w-[85%] self-end font-medium';
    } else {
        msgDiv.className = 'bg-[#272a2e]/50 text-[#f0f2f5] p-3 rounded-xl max-w-[85%] self-start border border-[#272a2e] whitespace-pre-wrap';
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

// Service Worker & Test Notification Trigger
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (err) {
            console.log('SW bypassed:', err);
        }
    }
}

async function testNotificationNow() {
    if (!("Notification" in window)) {
        alert("เบราว์เซอร์ของคุณไม่รองรับ Notification");
        return;
    }

    // ขออนุญาตอัตโนมัติหากยังไม่ได้กด
    let perm = Notification.permission;
    if (perm === 'default') {
        perm = await Notification.requestPermission();
    }

    if (perm === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification("🔔 ทดสอบการแจ้งเตือน (18:00 น.)", {
                body: "ระบบพร้อมส่งสรุปยอดรายวัน/รายสัปดาห์ ให้คุณตามกำหนดเวลาเรียบร้อยแล้ว!",
                icon: "/icon-192.png"
            });
        } else {
            new Notification("🔔 ทดสอบการแจ้งเตือน (18:00 น.)", {
                body: "ระบบพร้อมส่งสรุปยอดรายวัน/รายสัปดาห์ ให้คุณตามกำหนดเวลาเรียบร้อยแล้ว!"
            });
        }
    } else {
        alert("โปรดกดอนุญาตการแจ้งเตือนในตั้งค่าเบราว์เซอร์ (รูปแม่กุญแจ 🔒 ด้านบน URL) ก่อนทดสอบครับ");
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
