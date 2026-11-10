/**
 * PIN SECURITY SYSTEM MODULE
 * Handles PBKDF2 hashing, PIN verification, lock screen, & security settings.
 */

let pinInputBuffer = '';
let pinSetupStep = 1;
let pinTempFirst = '';
let pinFailedAttempts = 0;
let lockUntilTimestamp = 0;

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
    if (!overlay) return;

    const { pinHash } = await getPinData();

    if (!pinHash) {
        // No PIN yet (first visit, or after a reset): force the PIN setup screen
        pinSetupStep = 1;
        pinTempFirst = '';
        document.getElementById('pin-title').textContent = "ตั้งรหัส PIN 6 หลัก";
        document.getElementById('pin-subtitle').textContent = "กำหนดรหัสผ่านเพื่อความปลอดภัยในการเข้าใช้งาน";
        if (btnForgot) btnForgot.classList.add('hidden');
        overlay.classList.remove('hidden');
    } else {
        document.getElementById('pin-title').textContent = "P5 Devices Lock";
        document.getElementById('pin-subtitle').textContent = "กรุณากรอก PIN 6 หลักเพื่อเข้าใช้งาน";
        if (btnForgot) btnForgot.classList.remove('hidden');
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
    if (!container) return;
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
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.textContent = '';
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
                if (errEl) errEl.textContent = "รหัส PIN ไม่ตรงกัน กรุณาตั้งใหม่";
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
            if (errEl) errEl.textContent = "กรอกผิดเกิน 5 ครั้ง ล็อกเป็นเวลา 30 วินาที";
        } else {
            if (errEl) errEl.textContent = `รหัส PIN ไม่ถูกต้อง (เหลือ ${5 - pinFailedAttempts} ครั้ง)`;
        }
    }
}

function triggerPinErrorAnimation() {
    const dots = document.getElementById('pin-dots');
    if (!dots) return;
    dots.classList.add('shake-animation');
    setTimeout(() => dots.classList.remove('shake-animation'), 400);
}

function handleGlobalKeyDown(e) {
    const overlay = document.getElementById('pin-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        if (e.key >= '0' && e.key <= '9') {
            pressPinKey(e.key);
        } else if (e.key === 'Backspace') {
            backspacePinKey();
        } else if (e.key === 'Escape') {
            resetPinInput();
        }
    }
}

async function handleForgotPin() {
    const confirmed = await showConfirmDialog("รีเซ็ตรหัส PIN?", "การรีเซ็ต PIN จะอนุญาตให้คุณตั้ง PIN 6 หลักใหม่ โดยข้อมูลการเงินเดิมยังคงปลอดภัย");
    if (confirmed) {
        await setPinData(null, null);
        await checkPinState();
        showToast("ล้างรหัส PIN เดิมแล้ว", "info");
    }
}

async function triggerChangePin() {
    pinSetupStep = 1;
    pinInputBuffer = '';
    document.getElementById('pin-title').textContent = "ตั้งรหัส PIN 6 หลักใหม่";
    document.getElementById('pin-subtitle').textContent = "กำหนดรหัสผ่านใหม่เพื่อความปลอดภัยในการเข้าใช้งาน";
    const btnForgot = document.getElementById('btn-forgot-pin');
    if (btnForgot) btnForgot.classList.add('hidden');
    document.getElementById('pin-overlay').classList.remove('hidden');
    resetPinInput();
}