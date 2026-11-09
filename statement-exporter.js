/**
 * FINANCIAL REPORT & STATEMENT EXPORTER MODULE
 * Handles generating PDF Bank Statements & CSV exports.
 */

/**
 * Generate & Download PDF Bank Statement
 */
async function exportDataPDF() {
    showToast("กำลังเตรียมไฟล์ PDF Statement...", "info");

    const allTx = await db.transactions.orderBy('date').reverse().toArray();
    let totalIncomeSatang = 0;
    let totalExpenseSatang = 0;

    allTx.forEach(t => {
        if (t.type === 'income') totalIncomeSatang += t.amountSatang;
        else totalExpenseSatang += t.amountSatang;
    });

    const netBalanceSatang = totalIncomeSatang - totalExpenseSatang;

    // 1. Fill Header & Summary Data
    document.getElementById('pdf-date').textContent = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('pdf-net-balance').textContent = Satang.formatTHB(netBalanceSatang);
    document.getElementById('pdf-total-income').textContent = Satang.formatTHB(totalIncomeSatang);
    document.getElementById('pdf-total-expense').textContent = Satang.formatTHB(totalExpenseSatang);

    // 2. Render Chart Base64 Image
    if (dashboardChartInstance) {
        const chartImgUri = dashboardChartInstance.toBase64Image();
        document.getElementById('pdf-chart-img').src = chartImgUri;
    }

    // 3. Populate Transaction Table inside PDF Template
    const tbody = document.getElementById('pdf-table-body');
    tbody.innerHTML = '';

    if (allTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">ไม่มีข้อมูลรายการธุรกรรม</td></tr>`;
    } else {
        allTx.forEach(t => {
            const isIncome = t.type === 'income';
            const sign = isIncome ? '+' : '-';
            const textColor = isIncome ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold';
            const typeLabel = isIncome ? 'รายรับ' : 'รายจ่าย';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-2 border border-slate-200">${formatThaiDate(t.date)}</td>
                <td class="p-2 border border-slate-200 font-medium">${escapeHtml(t.title)}${t.note ? ` <span class="text-[10px] text-gray-400">(${escapeHtml(t.note)})</span>` : ''}</td>
                <td class="p-2 border border-slate-200">${escapeHtml(t.category)}</td>
                <td class="p-2 border border-slate-200 text-center font-medium">${typeLabel}</td>
                <td class="p-2 border border-slate-200 text-right ${textColor}">${sign}${Satang.formatTHB(t.amountSatang)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 4. Generate PDF Document using html2pdf.js
    const element = document.getElementById('pdf-statement-template');
    const opt = {
        margin:       [0.3, 0.3, 0.3, 0.3],
        filename:     `Nexus_Bank_Statement_${new Date().toISOString().split('T')[0]}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, logging: false },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        showToast("ดาวน์โหลด PDF Statement เรียบร้อย", "success");
    }).catch(err => {
        console.error("PDF Export error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้าง PDF", "error");
    });
}

/**
 * Generate & Download CSV File
 */
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
    dlAnchor.setAttribute("download", `nexus_transactions_${new Date().toISOString().split('T')[0]}.csv`);
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