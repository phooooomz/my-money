let currentType = 'expense';
let records = JSON.parse(localStorage.getItem('ledger_data_th')) || [];

// Prevent XSS security issues
function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Safely set default date input value to today (YYYY-MM-DD)
function setDefaultDate() {
    const dateInput = document.getElementById('input-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

function switchTab(tab) {
    const appTab = document.getElementById('tab-app');
    const aiTab = document.getElementById('tab-ai');
    const appBtn = document.getElementById('tab-app-btn');
    const aiBtn = document.getElementById('tab-ai-btn');

    if (!appTab || !aiTab || !appBtn || !aiBtn) return;

    if (tab === 'app') {
        appTab.classList.remove('hidden');
        appTab.classList.add('flex');
        aiTab.classList.remove('flex');
        aiTab.classList.add('hidden');
        
        appBtn.classList.add('tab-active');
        aiBtn.classList.remove('tab-active');
    } else {
        aiTab.classList.remove('hidden');
        aiTab.classList.add('flex');
        appTab.classList.remove('flex');
        appTab.classList.add('hidden');

        aiBtn.classList.add('tab-active');
        appBtn.classList.remove('tab-active');
    }
}

function selectType(type) {
    currentType = type;
    const expBtn = document.getElementById('type-expense-btn');
    const incBtn = document.getElementById('type-income-btn');

    if (!expBtn || !incBtn) return;

    if (type === 'expense') {
        expBtn.className = 'py-2 rounded-md text-center transition-all bg-[#16181a] text-[#f0f2f5] shadow-sm';
        incBtn.className = 'py-2 rounded-md text-center transition-all text-[#9ca3af] hover:text-[#f0f2f5]';
    } else {
        incBtn.className = 'py-2 rounded-md text-center transition-all bg-[#16181a] text-[#f0f2f5] shadow-sm';
        expBtn.className = 'py-2 rounded-md text-center transition-all text-[#9ca3af] hover:text-[#f0f2f5]';
    }
}

function render() {
    const listEl = document.getElementById('transaction-list');
    const countEl = document.getElementById('entry-count');
    const netBalanceEl = document.getElementById('net-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');

    if (!listEl || !countEl || !netBalanceEl || !totalIncomeEl || !totalExpenseEl) return;

    let totalIncome = 0;
    let totalExpense = 0;

    listEl.innerHTML = '';
    countEl.textContent = `${records.length} รายการ`;

    if (records.length === 0) {
        listEl.innerHTML = `
            <li class="p-8 text-center text-xs text-[#9ca3af]">
                ยังไม่มีรายการบันทึกในระบบ
            </li>
        `;
    } else {
        records.forEach((rec, idx) => {
            const amount = Number(rec.amount) || 0;
            if (rec.type === 'income') {
                totalIncome += amount;
            } else {
                totalExpense += amount;
            }

            const li = document.createElement('li');
            li.className = 'p-3.5 flex items-center justify-between hover:bg-[#202326] transition';
            
            const isIncome = rec.type === 'income';
            const sign = isIncome ? '+' : '-';
            const amountClass = isIncome ? 'text-[#f0f2f5]' : 'text-[#9ca3af]';
            const recordDate = rec.date || new Date().toISOString().split('T')[0];

            li.innerHTML = `
                <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-medium text-[#f0f2f5]">${escapeHtml(rec.desc || '')}</span>
                    <span class="text-[10px] text-[#9ca3af] font-mono">${recordDate}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-mono font-medium ${amountClass}">
                        ${sign}${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                    </span>
                    <button 
                        onclick="deleteRecord(${idx})"
                        class="text-[11px] text-[#9ca3af] hover:text-[#f0f2f5] transition px-1.5 py-0.5 rounded hover:bg-[#272a2e]"
                    >
                        ลบ
                    </button>
                </div>
            `;
            listEl.appendChild(li);
        });
    }

    const net = totalIncome - totalExpense;
    netBalanceEl.textContent = `${net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    totalIncomeEl.textContent = `${totalIncome.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    totalExpenseEl.textContent = `${totalExpense.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
}

function handleFormSubmit(e) {
    e.preventDefault();
    const dateEl = document.getElementById('input-date');
    const descEl = document.getElementById('input-desc');
    const amountEl = document.getElementById('input-amount');

    if (!descEl || !amountEl) return;

    const dateVal = (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().split('T')[0];
    const desc = descEl.value.trim();
    const amount = parseFloat(amountEl.value);

    if (!desc || isNaN(amount) || amount <= 0) return;

    const newRecord = {
        type: currentType,
        desc: desc,
        amount: amount,
        date: dateVal
    };

    records.unshift(newRecord);
    localStorage.setItem('ledger_data_th', JSON.stringify(records));

    descEl.value = '';
    amountEl.value = '';
    setDefaultDate();
    render();
}

function deleteRecord(index) {
    records.splice(index, 1);
    localStorage.setItem('ledger_data_th', JSON.stringify(records));
    render();
}

function sendQuickPrompt(promptText) {
    const inputEl = document.getElementById('chat-input');
    if (inputEl) {
        inputEl.value = promptText;
        handleChatSubmit(new Event('submit'));
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    if (!chatInput || !chatMessages) return;

    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage('user', message);
    chatInput.value = '';

    processLocalAiAgent(message);

    const loadingId = appendMessage('ai', 'กำลังคิดคำตอบ...');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: message,
                records: records
            })
        });

        const data = await response.json();
        removeMessage(loadingId);

        if (data.error) {
            appendMessage('ai', `เกิดข้อผิดพลาด: ${data.error}`);
        } else {
            appendMessage('ai', data.reply);
        }
    } catch (err) {
        removeMessage(loadingId);
        appendMessage('ai', 'ขออภัย ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI บน Cloudflare ได้ในขณะนี้');
    }
}

function processLocalAiAgent(prompt) {
    const recordMatch = prompt.match(/(บันทึก|จด)(รายรับ|รายจ่าย)?\s*(.+?)\s*(\d+(\.\d+)?)\s*(บาท)?$/i);
    
    if (recordMatch) {
        const intentType = recordMatch[2] === 'รายรับ' ? 'income' : 'expense';
        const desc = recordMatch[3].trim();
        const amount = parseFloat(recordMatch[4]);
        
        if (desc && !isNaN(amount)) {
            records.unshift({
                type: intentType,
                desc: desc,
                amount: amount,
                date: new Date().toISOString().split('T')[0]
            });
            localStorage.setItem('ledger_data_th', JSON.stringify(records));
            render();
        }
    }
}

function appendMessage(sender, text) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;

    const msgId = 'msg-' + Date.now();
    const isUser = sender === 'user';

    const div = document.createElement('div');
    div.id = msgId;
    div.className = isUser 
        ? 'self-end max-w-[85%] bg-[#f0f2f5] text-[#0c0d0e] p-3.5 rounded-xl font-medium' 
        : 'self-start max-w-[85%] bg-[#0c0d0e] border border-[#272a2e] p-3.5 rounded-xl text-[#f0f2f5]';

    div.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return msgId;
}

function removeMessage(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Function to update the Online/Offline status badge
function updateNetworkStatus() {
    const badge = document.getElementById('ai-status-badge');
    const dot = document.getElementById('ai-status-dot');
    const text = document.getElementById('ai-status-text');

    if (!dot || !text) return;

    if (navigator.onLine) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
        text.textContent = 'Online';
        text.className = 'text-[#f0f2f5]';
        if (badge) badge.className = 'text-[11px] font-mono bg-[#0c0d0e] px-2.5 py-1 border border-[#272a2e] rounded-md flex items-center gap-2';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-rose-500';
        text.textContent = 'Offline';
        text.className = 'text-rose-400';
        if (badge) badge.className = 'text-[11px] font-mono bg-[#0c0d0e] px-2.5 py-1 border border-rose-900/50 rounded-md flex items-center gap-2';
    }
}

// Safely initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    render();
    
    // Check initial network status & bind event listeners
    updateNetworkStatus();
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
});
