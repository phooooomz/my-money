/**
 * DEXIE INDEXEDDB DATABASE DEFINITION
 */
const db = new Dexie('NexusBankingDB');

// Define Schema: transactions & settings & categories
db.version(1).stores({
    transactions: 'id, type, title, category, date, amountSatang',
    categories: '++id, type, name',
    settings: 'key'
});

// Satang calculation precision engine
const Satang = {
    fromFloat: (amtFloat) => Math.round((parseFloat(amtFloat) || 0) * 100),
    toFloat: (satangInt) => (parseInt(satangInt) || 0) / 100,
    formatTHB: (satangInt) => {
        const val = (parseInt(satangInt) || 0) / 100;
        return '฿' + val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
};

// Application State
let currentTab = 'dashboard';
let pinInputBuffer = '';
let pinSetupStep = 1;
let pinTempFirst = '';
let pinFailedAttempts = 0;
let lockUntilTimestamp = 0;

let dashboardChartInstance = null;
let categoryChartInstance = null;
let monthlyChartInstance = null;
let dashboardTimeframe = 'month';

// Default categories to seed if empty
const defaultCategories = {
    income: ['เงินเดือน', 'งานเสริม', 'โบนัส', 'รายได้อื่น ๆ'],
    expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'ค่าใช้จ่ายประจำ', 'บิลและค่าสาธารณูปโภค', 'สุขภาพ', 'ความบันเทิง', 'อื่น ๆ']
};

/**
 * INITIALIZATION & SEEDING
 */
window.addEventListener('DOMContentLoaded', async () => {
    await seedDefaultCategoriesIfNeeded();
    initDateInputDefault();
    await checkPinState();
    window.addEventListener('keydown', handleGlobalKeyDown);
});

async function seedDefaultCategoriesIfNeeded() {
    const count = await db.categories.count();
    if (count === 0) {
        for (const cat of defaultCategories.income) {
            await db.categories.add({ type: 'income', name: cat });
        }
        for (const cat of defaultCategories.expense) {
            await db.categories.add({ type: 'expense', name: cat });
        }
    }
}

function initDateInputDefault() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tx-date').value = today;
}

/**
 * PIN SECURITY SYSTEM (IndexedDB Settings Store + Web Crypto)
 */
async function hashPin(pinText, saltHex = null) {
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pinText);
    
    let salt;
    if (saltHex) {
        salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    } else {
        salt = window.crypto.getRandomValues(new Uint8Array(16));
    }

    const keyMaterial = await window.crypto.subtle.importKey(
        'raw', pinData, { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const exportedKey = await window.crypto.subtle.exportKey('raw', derivedKey);
    const hashHex = Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHexStr = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

    return { hashHex, saltHexStr };
}

async function getPinData() {
    const pinHashItem = await db.settings.get('pinHash');
    const pinSaltItem = await db.settings.get('pinSalt');
    return {
        pinHash: pinHashItem ? pinHashItem.value : null,
        pinSalt: pinSaltItem ? pinSaltItem.value : null
    };
}

async function setPinData(pinHash, pinSalt) {
    if (pinHash && pinSalt) {
        await db.settings.put({ key: 'pinHash', value: pinHash });
        await db.settings.put({ key: 'pinSalt', value: pinSalt });
    } else {
        await db.settings.delete('pinHash');
        await db.settings.delete('pinSalt');
    }
}

async function checkPinState() {
    const overlay = document.getElementById('pin-overlay');
    const btnForgot = document.getElementById('btn-forgot-pin');
    const { pinHash } = await getPinData();

    if (!pinHash) {
        pinSetupStep = 1;
        document.getElementById('pin-title').textContent = "ตั้งรหัส PIN 6 หลัก";
        document.getElementById('pin-subtitle').textContent = "กำหนดรหัสผ่านเพื่อความปลอดภัยในการเข้าใช้งาน (IndexedDB)";
        btnForgot.classList.add('hidden');
        overlay.classList.remove('hidden');
    } else {
        document.getElementById('pin-title').textContent = "Nexus Banking Lock";
        document.getElementById('pin-subtitle').textContent = "กรุณากรอก PIN 6 หลักเพื่อเข้าใช้งาน";
        btnForgot.classList.remove('hidden');
        overlay.classList.remove('hidden');
    }
    resetPinInput();
}

function lockApp() {
    pinInputBuffer = '';
    checkPinState();
}

function updatePinDots() {
    const container = document.getElementById('pin-dots');
    const dots = container.querySelectorAll('div');
    for (let i = 0; i < 6; i++) {
        if (i < pinInputBuffer.length) {
            dots[i].className = 'w-4 h-4 rounded-full bg-bankingBlue border-2 border-bankingBlue shadow-sm shadow-bankingBlue/50';
        } else {
            dots[i].className = 'w-4 h-4 rounded-full border-2 border-darkBorder bg-transparent';
        }
    }
}

async function pressPinKey(digit) {
    if (Date.now() < lockUntilTimestamp) {
        const remainSec = Math.ceil((lockUntilTimestamp - Date.now()) / 1000);
        document.getElementById('pin-error-msg').textContent = `พยายามเกินกำหนด ลองใหม่ใน ${remainSec} วินาที`;
        return;
    }

    if (pinInputBuffer.length < 6) {
        pinInputBuffer += digit;
        updatePinDots();
    }

    if (pinInputBuffer.length === 6) {
        setTimeout(async () => {
            await processPinSubmission();
        }, 100);
    }
}

function backspacePinKey() {
    if (pinInputBuffer.length > 0) {
        pinInputBuffer = pinInputBuffer.slice(0, -1);
        updatePinDots();
    }
}

function resetPinInput() {
    pinInputBuffer = '';
    updatePinDots();
    document.getElementById('pin-error-msg').textContent = '';
}

async function processPinSubmission() {
    const errEl = document.getElementById('pin-error-msg');
    const { pinHash, pinSalt } = await getPinData();

    if (!pinHash) {
        if (pinSetupStep === 1) {
            pinTempFirst = pinInputBuffer;
            pinSetupStep = 2;
            pinInputBuffer = '';
            document.getElementById('pin-title').textContent = "ยืนยันรหัส PIN 6 หลัก";
            document.getElementById('pin-subtitle').textContent = "กรอกรหัส PIN เดิมอีกครั้งเพื่อยืนยัน";
            updatePinDots();
        } else if (pinSetupStep === 2) {
            if (pinInputBuffer === pinTempFirst) {
                const { hashHex, saltHexStr } = await hashPin(pinInputBuffer);
                await setPinData(hashHex, saltHexStr);
                document.getElementById('pin-overlay').classList.add('hidden');
                showToast("ตั้งรหัส PIN สำเร็จ", "success");
                renderApp();
            } else {
                triggerPinErrorAnimation();
                errEl.textContent = "รหัส PIN ไม่ตรงกัน กรุณาตั้งใหม่";
                pinSetupStep = 1;
                pinInputBuffer = '';
                document.getElementById('pin-title').textContent = "ตั้งรหัส PIN 6 หลัก";
                document.getElementById('pin-subtitle').textContent = "กำหนดรหัสผ่านเพื่อความปลอดภัยในการเข้าใช้งาน";
                updatePinDots();
            }
        }
        return;
    }

    const { hashHex } = await hashPin(pinInputBuffer, pinSalt);
    if (hashHex === pinHash) {
        pinFailedAttempts = 0;
        document.getElementById('pin-overlay').classList.add('hidden');
        renderApp();
    } else {
        pinFailedAttempts++;
        triggerPinErrorAnimation();
        pinInputBuffer = '';
        updatePinDots();
        if (pinFailedAttempts >= 5) {
            lockUntilTimestamp = Date.now() + 30000;
            errEl.textContent = "กรอกผิดเกิน 5 ครั้ง ล็อกเป็นเวลา 30 วินาที";
        } else {
            errEl.textContent = `รหัส PIN ไม่ถูกต้อง (เหลือ ${5 - pinFailedAttempts} ครั้ง)`;
        }
    }
}

function triggerPinErrorAnimation() {
    const dots = document.getElementById('pin-dots');
    dots.classList.add('shake-animation');
    setTimeout(() => dots.classList.remove('shake-animation'), 400);
}

function handleGlobalKeyDown(e) {
    const overlay = document.getElementById('pin-overlay');
    if (!overlay.classList.contains('hidden')) {
        if (e.key >= '0' && e.key <= '9') {
            pressPinKey(e.key);
        } else if (e.key === 'Backspace') {
            backspacePinKey();
        } else if (e.key === 'Escape') {
            resetPinInput();
        }
    }
}

function handleForgotPin() {
    showConfirmDialog(
        "รีเซ็ตรหัส PIN?",
        "การรีเซ็ต PIN จะอนุญาตให้คุณตั้ง PIN 6 หลักใหม่ โดยข้อมูลการเงินเดิมที่เก็บใน IndexedDB ยังคงปลอดภัย",
        async () => {
            await setPinData(null, null);
            await checkPinState();
            showToast("ล้างรหัส PIN เดิมแล้ว กรุณาตั้ง PIN ใหม่", "info");
        }
    );
}

function triggerChangePin() {
    showConfirmDialog(
        "เปลี่ยนรหัส PIN?",
        "ระบบจะกลับสู่หน้าตั้งค่า PIN 6 หลักใหม่",
        async () => {
            await setPinData(null, null);
            await checkPinState();
        }
    );
}

/**
 * NAVIGATION & VIEWS
 */
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('bg-bankingBlue', 'text-white');
        btn.classList.add('text-gray-300');
    });
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) {
        activeNav.classList.add('bg-bankingBlue', 'text-white');
        activeNav.classList.remove('text-gray-300');
    }

    document.querySelectorAll('.mob-nav-item').forEach(btn => {
        btn.classList.remove('text-bankingBlue');
        btn.classList.add('text-gray-400');
    });
    const activeMobNav = document.getElementById(`mob-nav-${tabId}`);
    if (activeMobNav) {
        activeMobNav.classList.add('text-bankingBlue');
        activeMobNav.classList.remove('text-gray-400');
    }

    renderApp();
}

async function renderApp() {
    await populateCategorySelects();
    await renderDashboard();
    await renderTransactionsView();
    await renderAnalyticsView();
    await renderCategoriesView();
}

/**
 * DASHBOARD MODULE (IndexedDB Queries)
 */
async function renderDashboard() {
    const allTx = await db.transactions.toArray();

    let totalIncomeSatang = 0;
    let totalExpenseSatang = 0;

    allTx.forEach(t => {
        if (t.type === 'income') totalIncomeSatang += t.amountSatang;
        else if (t.type === 'expense') totalExpenseSatang += t.amountSatang;
    });

    const netBalanceSatang = totalIncomeSatang - totalExpenseSatang;
    let savingsRate = 0;
    if (totalIncomeSatang > 0) {
        savingsRate = Math.max(0, Math.round((netBalanceSatang / totalIncomeSatang) * 100));
    }

    document.getElementById('dash-balance').textContent = Satang.formatTHB(netBalanceSatang);
    document.getElementById('dash-income').textContent = Satang.formatTHB(totalIncomeSatang);
    document.getElementById('dash-expense').textContent = Satang.formatTHB(totalExpenseSatang);
    document.getElementById('dash-savings-rate').textContent = `${savingsRate}%`;

    await renderRecentTransactions();
    await renderDashboardChart(allTx);
}

async function renderRecentTransactions() {
    const listEl = document.getElementById('dash-recent-list');
    listEl.innerHTML = '';

    const recent = await db.transactions.orderBy('date').reverse().limit(5).toArray();

    if (recent.length === 0) {
        listEl.innerHTML = `<div class="text-center py-6 text-xs text-gray-500">ยังไม่มีรายการบันทึก</div>`;
        return;
    }

    recent.forEach(t => {
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const colorClass = isIncome ? 'text-incomeGreen' : 'text-expenseRed';
        const bgIcon = isIncome ? 'bg-emerald-500/10 text-incomeGreen' : 'bg-rose-500/10 text-expenseRed';
        const iconClass = isIncome ? 'fa-arrow-down-left' : 'fa-arrow-up-right';

        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2.5 rounded-xl bg-darkSurface border border-darkBorder hover:border-gray-600 transition';
        div.innerHTML = `
            <div class="flex items-center space-x-3 min-w-0">
                <div class="w-9 h-9 rounded-lg ${bgIcon} flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="truncate">
                    <h4 class="text-xs font-semibold text-white truncate">${escapeHtml(t.title)}</h4>
                    <p class="text-[10px] text-gray-400">${t.category} • ${formatThaiDate(t.date)}</p>
                </div>
            </div>
            <span class="text-xs font-bold ${colorClass} flex-shrink-0 ml-2">${sign}${Satang.formatTHB(t.amountSatang)}</span>
        `;
        listEl.appendChild(div);
    });
}

function setDashboardChartTimeframe(tf) {
    dashboardTimeframe = tf;
    ['month', 'year', 'all'].forEach(k => {
        const btn = document.getElementById(`btn-tf-${k}`);
        if (k === tf) {
            btn.className = 'px-3 py-1 text-xs font-medium rounded-lg transition bg-bankingBlue text-white';
        } else {
            btn.className = 'px-3 py-1 text-xs font-medium rounded-lg transition text-gray-400 hover:text-white';
        }
    });
    renderApp();
}

async function renderDashboardChart(allTx) {
    const ctx = document.getElementById('dashMainChart').getContext('2d');
    if (dashboardChartInstance) dashboardChartInstance.destroy();

    const filteredTx = filterTxByTimeframe(allTx, dashboardTimeframe);
    const grouped = groupTxByPeriod(filteredTx);

    dashboardChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: grouped.labels,
            datasets: [
                { label: 'รายรับ', data: grouped.incomeData, backgroundColor: '#10B981', borderRadius: 6 },
                { label: 'รายจ่าย', data: grouped.expenseData, backgroundColor: '#EF4444', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9CA3AF', font: { family: 'Kanit' } } }
            },
            scales: {
                x: { ticks: { color: '#9CA3AF', font: { family: 'Kanit' } }, grid: { display: false } },
                y: { ticks: { color: '#9CA3AF', font: { family: 'Kanit' } }, grid: { color: '#30363D' } }
            }
        }
    });
}

/**
 * TRANSACTIONS MANAGEMENT MODULE (CRUD using Dexie IndexedDB)
 */
function applyTransactionFilters() {
    renderTransactionsView();
}

async function renderTransactionsView() {
    const search = document.getElementById('tx-search').value.toLowerCase();
    const typeFilter = document.getElementById('tx-filter-type').value;
    const catFilter = document.getElementById('tx-filter-category').value;
    const dateFilter = document.getElementById('tx-filter-date').value;

    let list = await db.transactions.toArray();

    if (search) {
        list = list.filter(t => t.title.toLowerCase().includes(search) || (t.note && t.note.toLowerCase().includes(search)));
    }
    if (typeFilter !== 'all') {
        list = list.filter(t => t.type === typeFilter);
    }
    if (catFilter !== 'all') {
        list = list.filter(t => t.category === catFilter);
    }
    list = filterTxByTimeframe(list, dateFilter);
    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    const tbody = document.getElementById('tx-table-body');
    const mobileList = document.getElementById('tx-mobile-list');
    const emptyState = document.getElementById('tx-empty-state');

    tbody.innerHTML = '';
    mobileList.innerHTML = '';

    if (list.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    list.forEach(t => {
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const colorClass = isIncome ? 'text-incomeGreen' : 'text-expenseRed';
        const badgeBg = isIncome ? 'bg-emerald-500/10 text-incomeGreen border-emerald-500/20' : 'bg-rose-500/10 text-expenseRed border-rose-500/20';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-darkSurface/50 transition';
        tr.innerHTML = `
            <td class="py-3.5 px-4 text-xs text-gray-400">${formatThaiDate(t.date)}</td>
            <td class="py-3.5 px-4">
                <div class="font-semibold text-white">${escapeHtml(t.title)}</div>
                ${t.note ? `<div class="text-[11px] text-gray-400">${escapeHtml(t.note)}</div>` : ''}
            </td>
            <td class="py-3.5 px-4">
                <span class="inline-block px-2.5 py-1 text-[11px] font-medium rounded-lg border ${badgeBg}">${escapeHtml(t.category)}</span>
            </td>
            <td class="py-3.5 px-4 text-right font-bold ${colorClass}">${sign}${Satang.formatTHB(t.amountSatang)}</td>
            <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center space-x-2">
                    <button onclick="openEditTransactionModal('${t.id}')" class="p-1.5 hover:bg-darkBorder rounded-lg text-gray-400 hover:text-white transition">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="confirmDeleteTransaction('${t.id}')" class="p-1.5 hover:bg-darkBorder rounded-lg text-gray-400 hover:text-expenseRed transition">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        const card = document.createElement('div');
        card.className = 'p-4 space-y-2';
        card.innerHTML = `
            <div class="flex items-start justify-between">
                <div>
                    <span class="text-[10px] text-gray-400">${formatThaiDate(t.date)}</span>
                    <h4 class="font-semibold text-sm text-white">${escapeHtml(t.title)}</h4>
                </div>
                <span class="font-bold text-sm ${colorClass}">${sign}${Satang.formatTHB(t.amountSatang)}</span>
            </div>
            <div class="flex items-center justify-between text-xs pt-1">
                <span class="px-2 py-0.5 rounded border text-[10px] ${badgeBg}">${escapeHtml(t.category)}</span>
                <div class="flex items-center space-x-3">
                    <button onclick="openEditTransactionModal('${t.id}')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                    <button onclick="confirmDeleteTransaction('${t.id}')" class="text-gray-400 hover:text-expenseRed"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                </div>
            </div>
        `;
        mobileList.appendChild(card);
    });
}

function setTxModalType(type) {
    document.getElementById('tx-type').value = type;
    const btnExpense = document.getElementById('tx-type-btn-expense');
    const btnIncome = document.getElementById('tx-type-btn-income');

    if (type === 'expense') {
        btnExpense.className = 'py-2 text-sm font-medium rounded-lg transition text-white bg-expenseRed';
        btnIncome.className = 'py-2 text-sm font-medium rounded-lg transition text-gray-400';
    } else {
        btnIncome.className = 'py-2 text-sm font-medium rounded-lg transition text-white bg-incomeGreen';
        btnExpense.className = 'py-2 text-sm font-medium rounded-lg transition text-gray-400';
    }
    populateCategorySelects();
}

function openTransactionModal() {
    document.getElementById('modal-tx-title').textContent = "เพิ่มรายการธุรกรรม";
    document.getElementById('tx-id').value = '';
    document.getElementById('form-tx').reset();
    initDateInputDefault();
    setTxModalType('expense');
    document.getElementById('modal-tx').classList.remove('hidden');
}

async function openEditTransactionModal(id) {
    const t = await db.transactions.get(id);
    if (!t) return;

    document.getElementById('modal-tx-title').textContent = "แก้ไขรายการธุรกรรม";
    document.getElementById('tx-id').value = t.id;
    document.getElementById('tx-title').value = t.title;
    document.getElementById('tx-amount').value = Satang.toFloat(t.amountSatang);
    document.getElementById('tx-date').value = t.date;
    document.getElementById('tx-note').value = t.note || '';

    setTxModalType(t.type);
    await populateCategorySelects();
    document.getElementById('tx-category').value = t.category;

    document.getElementById('modal-tx').classList.remove('hidden');
}

function closeTransactionModal() {
    document.getElementById('modal-tx').classList.add('hidden');
}

async function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('tx-id').value;
    const type = document.getElementById('tx-type').value;
    const title = document.getElementById('tx-title').value.trim();
    const amountVal = document.getElementById('tx-amount').value;
    const date = document.getElementById('tx-date').value;
    const category = document.getElementById('tx-category').value;
    const note = document.getElementById('tx-note').value.trim();

    if (!title || !amountVal || !date || !category) {
        showToast("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน", "error");
        return;
    }

    const amountSatang = Satang.fromFloat(amountVal);
    if (amountSatang <= 0) {
        showToast("จำนวนเงินต้องมากกว่า 0", "error");
        return;
    }

    const txItem = {
        id: id || ('TX_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
        type,
        title,
        amountSatang,
        date,
        category,
        note
    };

    await db.transactions.put(txItem);
    showToast(id ? "อัปเดตรายการเรียบร้อย" : "บันทึกรายการลง IndexedDB สำเร็จ", "success");

    closeTransactionModal();
    renderApp();
}

function confirmDeleteTransaction(id) {
    showConfirmDialog(
        "ลบรายการธุรกรรม?",
        "คุณแน่ใจหรือว่าต้องการลบรายการนี้จาก IndexedDB",
        async () => {
            await db.transactions.delete(id);
            renderApp();
            showToast("ลบรายการสำเร็จ", "success");
        }
    );
}

/**
 * CATEGORIES MODULE (IndexedDB Operations)
 */
async function populateCategorySelects() {
    const currentType = document.getElementById('tx-type').value;
    const modalCatSelect = document.getElementById('tx-category');
    const filterCatSelect = document.getElementById('tx-filter-category');

    modalCatSelect.innerHTML = '';
    const catsForType = await db.categories.where('type').equals(currentType).toArray();
    catsForType.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        modalCatSelect.appendChild(opt);
    });

    const filterPrev = filterCatSelect.value;
    filterCatSelect.innerHTML = `<option value="all">ทุกหมวดหมู่</option>`;
    const allCats = await db.categories.toArray();
    const uniqueCatNames = [...new Set(allCats.map(c => c.name))];
    uniqueCatNames.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        filterCatSelect.appendChild(opt);
    });
    filterCatSelect.value = filterPrev;
}

async function renderCategoriesView() {
    const incomeList = document.getElementById('cat-income-list');
    const expenseList = document.getElementById('cat-expense-list');

    incomeList.innerHTML = '';
    expenseList.innerHTML = '';

    const incomeCats = await db.categories.where('type').equals('income').toArray();
    const expenseCats = await db.categories.where('type').equals('expense').toArray();

    for (const c of incomeCats) {
        incomeList.appendChild(await createCategoryBadge(c));
    }
    for (const c of expenseCats) {
        expenseList.appendChild(await createCategoryBadge(c));
    }
}

async function createCategoryBadge(catObj) {
    const count = await db.transactions.where('category').equals(catObj.name).count();
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 rounded-xl bg-darkSurface border border-darkBorder';
    div.innerHTML = `
        <div>
            <span class="text-sm font-medium text-white">${escapeHtml(catObj.name)}</span>
            <span class="text-[10px] text-gray-400 block">${count} รายการ</span>
        </div>
        <button onclick="deleteCategory(${catObj.id}, '${catObj.name}')" class="p-1.5 text-gray-500 hover:text-expenseRed transition">
            <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
    `;
    return div;
}

function openCategoryModal() {
    document.getElementById('form-cat').reset();
    document.getElementById('modal-cat').classList.remove('hidden');
}

function closeCategoryModal() {
    document.getElementById('modal-cat').classList.add('hidden');
}

async function saveCategory(e) {
    e.preventDefault();
    const type = document.getElementById('cat-type').value;
    const name = document.getElementById('cat-name').value.trim();

    if (!name) return;

    const existing = await db.categories.where({ type, name }).first();
    if (existing) {
        showToast("มีหมวดหมู่นี้อยู่แล้ว", "error");
        return;
    }

    await db.categories.add({ type, name });
    closeCategoryModal();
    renderApp();
    showToast("เพิ่มหมวดหมู่สำเร็จ", "success");
}

async function deleteCategory(id, catName) {
    const usedCount = await db.transactions.where('category').equals(catName).count();
    if (usedCount > 0) {
        showToast(`ไม่สามารถลบได้ มี ${usedCount} รายการใช้งานหมวดหมู่นี้อยู่`, "error");
        return;
    }

    showConfirmDialog(
        "ยืนยันการลบหมวดหมู่?",
        `คุณต้องการลบหมวดหมู่ "${catName}" หรือไม่?`,
        async () => {
            await db.categories.delete(id);
            renderApp();
            showToast("ลบหมวดหมู่เรียบร้อย", "success");
        }
    );
}

/**
 * ANALYTICS MODULE
 */
async function renderAnalyticsView() {
    const allTx = await db.transactions.toArray();
    const expenses = allTx.filter(t => t.type === 'expense');
    const totalIncomeSatang = allTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountSatang, 0);
    const totalExpenseSatang = expenses.reduce((sum, t) => sum + t.amountSatang, 0);

    const catMap = {};
    expenses.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amountSatang;
    });

    let topCat = '-';
    let topCatAmt = 0;
    Object.keys(catMap).forEach(c => {
        if (catMap[c] > topCatAmt) {
            topCatAmt = catMap[c];
            topCat = c;
        }
    });

    const avgExpenseSatang = expenses.length > 0 ? Math.round(totalExpenseSatang / expenses.length) : 0;
    const ratio = totalIncomeSatang > 0 ? Math.round((totalExpenseSatang / totalIncomeSatang) * 100) : 0;

    document.getElementById('analytics-top-category').textContent = topCat;
    document.getElementById('analytics-top-category-amt').textContent = Satang.formatTHB(topCatAmt);
    document.getElementById('analytics-avg-expense').textContent = Satang.formatTHB(avgExpenseSatang);
    document.getElementById('analytics-expense-ratio').textContent = `${ratio}%`;

    renderExpenseCategoryChart(catMap);
    renderMonthlyComparisonChart(allTx);
}

function renderExpenseCategoryChart(catMap) {
    const ctx = document.getElementById('chartExpenseCategory').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    const labels = Object.keys(catMap);
    const data = Object.values(catMap).map(s => Satang.toFloat(s));

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'Kanit' } } }
            }
        }
    });
}

function renderMonthlyComparisonChart(allTx) {
    const ctx = document.getElementById('chartMonthlyComparison').getContext('2d');
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    const grouped = groupTxByPeriod(allTx);

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: grouped.labels,
            datasets: [
                { label: 'รายรับ', data: grouped.incomeData, backgroundColor: '#10B981' },
                { label: 'รายจ่าย', data: grouped.expenseData, backgroundColor: '#EF4444' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9CA3AF', font: { family: 'Kanit' } } }
            },
            scales: {
                x: { ticks: { color: '#9CA3AF' }, grid: { display: false } },
                y: { ticks: { color: '#9CA3AF' }, grid: { color: '#30363D' } }
            }
        }
    });
}

/**
 * IMPORT / EXPORT & DATA BACKUP (IndexedDB Data Export)
 */
async function exportDataJSON() {
    const transactions = await db.transactions.toArray();
    const categories = await db.categories.toArray();
    const exportData = { transactions, categories };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `nexus_indexeddb_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("ส่งออกไฟล์ JSON เรียบร้อย", "success");
}

async function exportDataCSV() {
    const transactions = await db.transactions.toArray();
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "ID,Date,Type,Title,Category,Amount_THB,Note\n";

    transactions.forEach(t => {
        const amtStr = Satang.toFloat(t.amountSatang).toFixed(2);
        csvContent += `"${t.id}","${t.date}","${t.type}","${t.title}","${t.category}","${amtStr}","${t.note || ''}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nexus_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("ส่งออกไฟล์ CSV เรียบร้อย", "success");
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && Array.isArray(imported.transactions)) {
                await db.transactions.clear();
                await db.transactions.bulkAdd(imported.transactions);
                
                if (Array.isArray(imported.categories)) {
                    await db.categories.clear();
                    await db.categories.bulkAdd(imported.categories);
                }

                renderApp();
                showToast("นำเข้าข้อมูลสู่ IndexedDB เรียบร้อยแล้ว", "success");
            } else {
                showToast("รูปแบบไฟล์ JSON ไม่ถูกต้อง", "error");
            }
        } catch (err) {
            showToast("ไม่สามารถอ่านไฟล์ JSON ได้", "error");
        }
    };
    reader.readAsText(file);
}

function confirmWipeAllData() {
    showConfirmDialog(
        "ล้างข้อมูลธุรกรรมทั้งหมด?",
        "การดำเนินการนี้จะลบรายการรายรับ-รายจ่ายทั้งหมดออกจาก IndexedDB",
        async () => {
            await db.transactions.clear();
            renderApp();
            showToast("ล้างข้อมูลทางการเงินใน IndexedDB แล้ว", "info");
        }
    );
}

/**
 * HELPER UTILITIES
 */
function filterTxByTimeframe(txList, tf) {
    const now = new Date();
    if (tf === 'month' || tf === 'this_month') {
        const year = now.getFullYear();
        const month = now.getMonth();
        return txList.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });
    } else if (tf === 'last_month') {
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = lastMonthDate.getFullYear();
        const month = lastMonthDate.getMonth();
        return txList.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });
    } else if (tf === 'year' || tf === 'this_year') {
        const year = now.getFullYear();
        return txList.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === year;
        });
    }
    return txList;
}

function groupTxByPeriod(txList) {
    const map = {};
    txList.forEach(t => {
        const monthKey = t.date.substring(0, 7);
        if (!map[monthKey]) map[monthKey] = { incomeSatang: 0, expenseSatang: 0 };
        if (t.type === 'income') map[monthKey].incomeSatang += t.amountSatang;
        else map[monthKey].expenseSatang += t.amountSatang;
    });

    const labels = Object.keys(map).sort();
    const incomeData = labels.map(k => Satang.toFloat(map[k].incomeSatang));
    const expenseData = labels.map(k => Satang.toFloat(map[k].expenseSatang));

    return { labels, incomeData, expenseData };
}

function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    let icon = 'fa-circle-info';
    let borderClass = 'border-bankingBlue';
    if (type === 'success') { icon = 'fa-circle-check'; borderClass = 'border-incomeGreen'; }
    if (type === 'error') { icon = 'fa-circle-exclamation'; borderClass = 'border-expenseRed'; }

    toast.className = `pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-xl bg-darkSurface text-white text-xs shadow-xl border-l-4 ${borderClass} transition-all transform translate-y-2 opacity-0`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showConfirmDialog(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;

    const modal = document.getElementById('modal-confirm');
    const btnOk = document.getElementById('confirm-btn-ok');
    const btnCancel = document.getElementById('confirm-btn-cancel');

    modal.classList.remove('hidden');

    const cleanup = () => {
        modal.classList.add('hidden');
        btnOk.onclick = null;
        btnCancel.onclick = null;
    };

    btnOk.onclick = async () => {
        cleanup();
        await onConfirm();
    };

    btnCancel.onclick = cleanup;
}