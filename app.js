let currentType = 'expense';
let records = JSON.parse(localStorage.getItem('ledger_data_th')) || [];

function switchTab(tab) {
    const appTab = document.getElementById('tab-app');
    const aiTab = document.getElementById('tab-ai');
    const appBtn = document.getElementById('tab-app-btn');
    const aiBtn = document.getElementById('tab-ai-btn');

    if (tab === 'app') {
        appTab.classList.remove('hidden');
        appTab.classList.add('flex');
        aiTab.classList.add('hidden');
        aiTab.classList.remove('flex');
        appBtn.className = "pb-2 tab-active transition-colors";
        aiBtn.className = "pb-2 hover:text-[#f0f2f5] transition-colors";
    } else {
        aiTab.classList.remove('hidden');
        aiTab.classList.add('flex');
        appTab.classList.add('hidden');
        appTab.classList.remove('flex');
        aiBtn.className = "pb-2 tab-active transition-colors";
        appBtn.className = "pb-2 hover:text-[#f0f2f5] transition-colors";
    }
}

function selectType(type) {
    currentType = type;
    const expBtn = document.getElementById('type-expense-btn');
    const incBtn = document.getElementById('type-income-btn');

    if (type === 'expense') {
        expBtn.className = "py-2 rounded-md text-center transition-all bg-[#16181a] text-[#f0f2f5] shadow-sm";
        incBtn.className = "py-2 rounded-md text-center transition-all text-[#9ca3af] hover:text-[#f0f2f5]";
    } else {
        incBtn.className = "py-2 rounded-md text-center transition-all bg-[#16181a] text-[#f0f2f5] shadow-sm";
        expBtn.className = "py-2 rounded-md text-center transition-all text-[#9ca3af] hover:text-[#f0f2f5]";
    }
}

function render() {
    const listEl = document.getElementById('transaction-list');
    const countEl = document.getElementById('entry-count');
    const netBalanceEl = document.getElementById('net-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');

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
            if (rec.type === 'income') {
                totalIncome += rec.amount;
            } else {
                totalExpense += rec.amount;
            }

            const li = document.createElement('li');
            li.className = 'p-3.5 flex items-center justify-between hover:bg-[#202326] transition';
            
            const isIncome = rec.type === 'income';
            const sign = isIncome ? '+' : '-';
            const amountClass = isIncome ? 'text-[#f0f2f5]' : 'text-[#9ca3af]';

            li.innerHTML = `
                <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-medium text-[#f0f2f5]">${escapeHtml(rec.desc)}</span>
                    <span class="text-[10px] text-[#9ca3af] font-mono">${rec.date}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-mono font-medium ${amountClass}">
                        ${sign}${rec.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
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
    const descEl = document.getElementById('input-desc');
    const amountEl = document.getElementById('input-amount');

    const desc = descEl.value.trim();
    const amount = parseFloat(amountEl.value);

    if (!desc || isNaN(amount) || amount <= 0) return;

    const newRecord = {
        type: currentType,
        desc: desc,
        amount: amount,
        date: new Date().toLocaleDateString('th-TH')
    };

    records.unshift(newRecord);
    localStorage.setItem('ledger_data_th', JSON.stringify(records));

    descEl.value = '';
    amountEl.value = '';

    render();
}

function deleteRecord(idx) {
    records.splice(idx, 1);
    localStorage.setItem('ledger_data_th', JSON.stringify(records));
    render();
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// --- AI CHAT & CLOUDFLARE FUNCTION INTEGRATION ---

function appendMessage(role, text) {
    const chatBox = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    
    if (role === 'user') {
        msgDiv.className = 'self-end max-w-[85%] bg-[#f0f2f5] text-[#0c0d0e] p-3 rounded-xl font-medium';
    } else {
        msgDiv.className = 'self-start max-w-[85%] bg-[#0c0d0e] border border-[#272a2e] p-3.5 rounded-xl text-[#f0f2f5] whitespace-pre-wrap';
    }
    
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function sendQuickPrompt(promptText) {
    document.getElementById('chat-input').value = promptText;
    handleChatSubmit(new Event('submit'));
}

async function handleChatSubmit(e) {
    e.preventDefault();
    const inputEl = document.getElementById('chat-input');
    const prompt = inputEl.value.trim();
    if (!prompt) return;

    appendMessage('user', prompt);
    inputEl.value = '';

    await callCloudflareAiApi(prompt);
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
                date: new Date().toLocaleDateString('th-TH')
            });
            localStorage.setItem('ledger_data_th', JSON.stringify(records));
            render();
        }
    }
}

async function callCloudflareAiApi(prompt) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                records: records
            })
        });

        const result = await response.json();
        
        if (result.reply) {
            processLocalAiAgent(prompt);
            appendMessage('ai', result.reply);
        } else {
            appendMessage('ai', 'เกิดข้อผิดพลาดในการตอบกลับจาก AI: ' + (result.error || 'ไม่สามารถรับข้อมูลได้'));
        }
    } catch (err) {
        processLocalAiAgent(prompt);
        appendMessage('ai', 'ขณะนี้กำลังทำงานในโหมด Offline (บันทึกข้อมูลเรียบร้อยแล้ว)');
    }
}

render();