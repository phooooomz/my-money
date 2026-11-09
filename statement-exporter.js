/**
 * FINANCIAL REPORT & STATEMENT EXPORTER MODULE (A4 Standard Optimized)
 */

async function exportDataPDF() {
    showToast("กำลังเตรียมไฟล์ PDF Statement (v2)...", "info");

    const allTx = await db.transactions.orderBy('date').reverse().toArray();
    let totalIncomeSatang = 0;
    let totalExpenseSatang = 0;

    allTx.forEach(t => {
        if (t.type === 'income') totalIncomeSatang += t.amountSatang;
        else totalExpenseSatang += t.amountSatang;
    });

    const netBalanceSatang = totalIncomeSatang - totalExpenseSatang;

    // Format numbers safely without unicode currency symbols that break jsPDF default fonts
    const formatSafeTHB = (satangInt) => {
        const val = (parseInt(satangInt) || 0) / 100;
        return val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' THB';
    };

    // 1. Fill Header & Summary Data safely
    document.getElementById('pdf-date').textContent = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('pdf-net-balance').textContent = formatSafeTHB(netBalanceSatang);
    document.getElementById('pdf-total-income').textContent = formatSafeTHB(totalIncomeSatang);
    document.getElementById('pdf-total-expense').textContent = formatSafeTHB(totalExpenseSatang);

    // 2. Populate Transaction Table inside PDF Template
    const tbody = document.getElementById('pdf-table-body');
    tbody.innerHTML = '';

    if (allTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400 font-normal">ไม่มีข้อมูลรายการธุรกรรม</td></tr>`;
    } else {
        allTx.forEach(t => {
            const isIncome = t.type === 'income';
            const sign = isIncome ? '+' : '-';
            const textColor = isIncome ? 'color: #059669; font-weight: 600;' : 'color: #E11D48; font-weight: 600;';
            const typeLabel = isIncome ? 'รายรับ' : 'รายจ่าย';
            const formattedAmt = sign + (t.amountSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' THB';

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #E2E8F0';
            tr.innerHTML = `
                <td style="padding: 10px 12px; color: #475569; white-space: nowrap;">${formatThaiDate(t.date)}</td>
                <td style="padding: 10px 12px; font-weight: 500; color: #1E293B;">${escapeHtml(t.title)}${t.note ? ` <span style="font-size: 9px; color: #94A3B8;">(${escapeHtml(t.note)})</span>` : ''}</td>
                <td style="padding: 10px 12px; color: #475569;">${escapeHtml(t.category)}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 500; color: #475569;">${typeLabel}</td>
                <td style="padding: 10px 12px; text-align: right; ${textColor}">${formattedAmt}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 3. Render template to canvas, then build the A4 PDF page by page
    const element = document.getElementById('pdf-statement-template');
    const filename = `P5_Devices_Statement_${new Date().toISOString().split('T')[0]}.pdf`;

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const PDF_CSS_WIDTH = 720; // must match the template width in index.html

        // Row bottoms (in CSS px, relative to the template) so pages break between rows, not through them
        const elTop = element.getBoundingClientRect().top;
        const rowBreaks = Array.from(element.querySelectorAll('#pdf-table-body tr'))
            .map(tr => tr.getBoundingClientRect().bottom - elTop);

        // Keep the canvas under browser size limits when there are many rows
        const scale = Math.max(1, Math.min(2, 14000 / element.offsetHeight));

        const canvas = await html2canvas(element, {
            scale,
            logging: false,
            useCORS: true,
            backgroundColor: '#FFFFFF',
            width: PDF_CSS_WIDTH,
            windowWidth: PDF_CSS_WIDTH,
            scrollX: 0,
            scrollY: 0
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

        const PAGE_W = 210, PAGE_H = 297, MARGIN = 10;
        const contentW = PAGE_W - MARGIN * 2;
        const mmPerCssPx = contentW / PDF_CSS_WIDTH;
        const pageCssH = (PAGE_H - MARGIN * 2) / mmPerCssPx;
        const pxPerCss = canvas.width / PDF_CSS_WIDTH;
        const totalCssH = canvas.height / pxPerCss;

        const slices = computePdfPageSlices(totalCssH, pageCssH, rowBreaks);

        slices.forEach((sl, i) => {
            const sy = Math.round(sl.start * pxPerCss);
            const sh = Math.min(Math.ceil((sl.end - sl.start) * pxPerCss), canvas.height - sy);
            if (sh <= 0) return;

            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = sh;
            const ctx = pageCanvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);

            if (i > 0) pdf.addPage();
            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', MARGIN, MARGIN, contentW, (sh / pxPerCss) * mmPerCssPx, undefined, 'FAST');
        });

        pdf.save(filename);
        showToast("ดาวน์โหลด PDF Statement เรียบร้อย", "success");
    } catch (err) {
        console.error("PDF Export error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้าง PDF", "error");
    }
}

/**
 * Split a tall render into A4 pages. Breaks land on a table-row boundary when possible.
 * All numbers are CSS px relative to the top of the template.
 */
function computePdfPageSlices(totalH, pageH, rowBreaks) {
    const slices = [];
    let start = 0;
    while (start < totalH - 1) {
        let end = start + pageH;
        if (end >= totalH) {
            end = totalH;
        } else {
            const fits = rowBreaks.filter(b => b > start + 40 && b <= end);
            if (fits.length) end = fits[fits.length - 1];
        }
        slices.push({ start, end });
        start = end;
    }
    return slices;
}

async function exportDataCSV() {
    showToast("กำลังเตรียมส่งออกไฟล์ CSV...", "info");
    const txs = await db.transactions.orderBy('date').reverse().toArray();
    let csvContent = "\uFEFFID,Date,Type,Category,Title,Amount_THB,Note\n";

    txs.forEach(t => {
        const amtStr = Satang.toFloat(t.amountSatang).toFixed(2);
        csvContent += `"${t.id}","${t.date}","${t.type}","${t.category}","${t.title.replace(/"/g, '""')}","${amtStr}","${(t.note || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", url);
    dlAnchor.setAttribute("download", `p5_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    Swal.fire({
        icon: 'success',
        title: 'ส่งออก CSV สำเร็จ',
        text: `ทำการดาวน์โหลดรายการธุรกรรม ${txs.length} รายการแล้ว`,
        timer: 1500,
        showConfirmButton: false,
        background: '#1F2937',
        color: '#F3F4F6'
    });
}