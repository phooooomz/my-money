// ... existing code ...
let currentType = 'expense';
let records = JSON.parse(localStorage.getItem('ledger_data_th')) || [];

// Set default date input value to today (YYYY-MM-DD)
function setDefaultDate() {
    const dateInput = document.getElementById('input-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

function switchTab(tab) {
// ... existing code ...
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
                    <span class="text-[10px] text-[#9ca3af] font-mono">${rec.date || 'ไม่ระบุวันที่'}</span>
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
    const dateEl = document.getElementById('input-date');
    const descEl = document.getElementById('input-desc');
    const amountEl = document.getElementById('input-amount');

    const dateVal = dateEl.value || new Date().toISOString().split('T')[0];
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
// ... existing code ...
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
// ... existing code ...
setDefaultDate();
render();
