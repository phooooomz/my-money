/**
 * EXPANDABLE CONTACT & RATING WIDGET
 * - แก้ช่องทางติดต่อได้ที่ CONTACT_CHANNELS ด้านล่าง (เปลี่ยน href / label / icon / color)
 * - ไอคอนแบรนด์ใช้ 'fa-brands fa-xxx', ไอคอนทั่วไปใช้ 'fa-solid fa-xxx' (FontAwesome 6.4 Free)
 */
const CONTACT_CHANNELS = [
    { label: 'LINE',      sub: '@',  icon: 'fa-brands fa-line',      color: '#06C755', href: 'https://line.me/' },
    { label: 'Instagram', sub: '@',       icon: 'fa-brands fa-instagram', color: '#E1306C', href: 'https://instagram.com/' },
    { label: 'Discord',   sub: '',    icon: 'fa-brands fa-discord',   color: '#5865F2', href: 'https://discord.gg/' }
];

/** ตอนนี้ยังไม่เก็บคะแนนที่ไหน — ไว้ค่อยต่อ Google Form / Firebase ฯลฯ ที่ฟังก์ชันนี้ในอนาคต */
function submitRating(value) {
    // intentionally empty
}

/* ---------- Panel open / close ---------- */
function toggleContactWidget(forceState) {
    const panel = document.getElementById('cw-panel');
    const fab = document.getElementById('cw-fab');
    const icon = document.getElementById('cw-fab-icon');
    if (!panel || !fab) return;

    const open = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    fab.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    icon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-headset';
}

function renderContactChannels() {
    const list = document.getElementById('cw-contact-list');
    if (!list) return;
    list.innerHTML = '';
    CONTACT_CHANNELS.forEach(c => {
        const a = document.createElement('a');
        a.className = 'cw-contact-item';
        a.href = c.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = `
            <span class="cw-contact-icon" style="background:${c.color}"><i class="${c.icon}"></i></span>
            <span class="flex-1 min-w-0">
                <span class="block font-medium leading-tight">${escapeHtml(c.label)}</span>
                <span class="block text-[11px] text-gray-400 truncate">${escapeHtml(c.sub)}</span>
            </span>
            <i class="fa-solid fa-chevron-right text-[10px] text-gray-500"></i>`;
        list.appendChild(a);
    });
}

/* ---------- Rating animation ---------- */
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function getStars() {
    return Array.from(document.querySelectorAll('#cw-stars .cw-star'));
}

function showThanksState(value) {
    const stars = getStars();
    stars.forEach(s => { s.style.display = 'none'; });
    const thanks = document.getElementById('cw-thanks');
    thanks.classList.remove('show');
    thanks.style.opacity = '1';
    thanks.style.transform = 'none';
    thanks.style.filter = 'none';
    thanks.textContent = `ขอบคุณ! ${value}/5`;
    document.getElementById('cw-rerate').classList.remove('hidden');
}

async function handleStarTap(value) {
    const box = document.getElementById('cw-rating');
    if (box.classList.contains('locked')) return;
    box.classList.add('locked');

    const stars = getStars();
    const thanks = document.getElementById('cw-thanks');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    submitRating(value);

    if (reduce) {
        showThanksState(value);
        return;
    }

    // 1) fill stars up to the tapped one
    for (let i = 0; i < value; i++) {
        stars[i].classList.add('filled');
        await wait(70);
    }
    // stars beyond the tapped one fade away
    stars.slice(value).forEach(s => s.classList.add('fade'));
    await wait(350);

    // 2) gather the filled stars into the centre of the row
    const rowRect = document.getElementById('cw-stars').getBoundingClientRect();
    const centerX = rowRect.left + rowRect.width / 2;
    stars.slice(0, value).forEach(s => {
        const r = s.getBoundingClientRect();
        const dx = centerX - (r.left + r.width / 2);
        s.style.transform = `translateX(${dx}px) scale(0.9)`;
    });
    await wait(550);

    // 3) merge into one star, then morph into the thank-you text
    stars.slice(0, value).forEach((s, i) => {
        if (i === 0) s.classList.add('merged');
        else s.classList.add('vanish');
    });
    await wait(250);
    thanks.textContent = 'ขอบคุณ!';
    thanks.classList.add('show');
    document.getElementById('cw-rerate').classList.remove('hidden');
}

function resetRating() {
    const box = document.getElementById('cw-rating');
    const thanks = document.getElementById('cw-thanks');
    getStars().forEach(s => {
        s.className = 'cw-star';
        s.style.cssText = '';
    });
    thanks.className = 'cw-thanks';
    thanks.style.cssText = '';
    box.classList.remove('locked');
    document.getElementById('cw-rerate').classList.add('hidden');
}

/* ---------- Init ---------- */
window.addEventListener('DOMContentLoaded', () => {
    renderContactChannels();

    getStars().forEach(star => {
        star.addEventListener('click', () => handleStarTap(parseInt(star.dataset.value, 10)));
    });

    // close on outside click / Esc
    document.addEventListener('click', (e) => {
        const widget = document.getElementById('contact-widget');
        if (widget && !widget.contains(e.target)) toggleContactWidget(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleContactWidget(false);
    });
});