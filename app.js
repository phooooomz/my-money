// ================= SETTINGS, BACKUP & RESET =================
async function exportDataJSON() {
    const txs = await db.transactions.toArray();
    const cats = await db.categories.toArray();
    const exportObj = { transactions: txs, categories: cats, exportDate: new Date().toISOString() };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `banking_finance_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    Swal.fire({ icon: 'success', title: 'ส่งออก JSON สำเร็จ', timer: 1200, showConfirmButton: false, background: '#131b2e', color: '#f8fafc' });
}

async function exportDataCSV() {
    const txs = await getAllTransactions();
    let csvContent = "\uFEFFID,Date,Type,Category,Title,Amount,Note\n";
    txs.forEach(t => {
        csvContent += `"${t.id}","${t.date}","${t.type}","${t.category}","${t.title.replace(/"/g, '""')}","${t.amount}","${(t.note || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", url);
    dlAnchor.setAttribute("download", `banking_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    Swal.fire({ icon: 'success', title: 'ส่งออก CSV สำเร็จ', timer: 1200, showConfirmButton: false, background: '#131b2e', color: '#f8fafc' });
}

async function importDataJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const rawData = JSON.parse(event.target.result);
            
            // รองรับทั้งไฟล์แบบมีคีย์ transactions หรือเป็น Array ตรงๆ
            const txs = Array.isArray(rawData) ? rawData : (rawData.transactions || []);
            const cats = Array.isArray(rawData.categories) ? rawData.categories : null;

            if (txs.length > 0 || (cats && cats.length > 0)) {
                await db.transaction('rw', db.transactions, db.categories, async () => {
                    if (txs.length > 0) {
                        await db.transactions.clear();
                        // จัดรูปแบบข้อมูลให้สะอาด ป้องกันปัญหา ID ชนกัน
                        const cleanTxs = txs.map(t => ({
                            type: t.type || 'expense',
                            title: t.title || 'ไม่ระบุชื่อ',
                            amount: Number(t.amount) || 0,
                            category: t.category || 'อื่น ๆ',
                            date: t.date || new Date().toISOString().split('T')[0],
                            note: t.note || ''
                        }));
                        await db.transactions.bulkAdd(cleanTxs);
                    }
                    if (cats && cats.length > 0) {
                        await db.categories.clear();
                        const cleanCats = cats.map(c => ({
                            name: c.name,
                            type: c.type || 'expense'
                        }));
                        await db.categories.bulkAdd(cleanCats);
                    }
                });

                Swal.fire({ 
                    icon: 'success', 
                    title: 'นำเข้าข้อมูลสำเร็จ', 
                    text: `โหลดข้อมูลธุรกรรม ${txs.length} รายการเรียบร้อย`, 
                    background: '#131b2e', 
                    color: '#f8fafc' 
                });
                loadDashboardData();
                if (document.getElementById('transactions-view').classList.contains('active')) {
                    filterTransactions();
                }
            } else {
                throw new Error('ไม่พบข้อมูลธุรกรรมในไฟล์');
            }
        } catch (err) {
            console.error('Import error:', err);
            Swal.fire({ 
                icon: 'error', 
                title: 'นำเข้าข้อมูลไม่สำเร็จ', 
                text: 'รูปแบบไฟล์ JSON ไม่ถูกต้องหรือเสียหาย', 
                background: '#131b2e', 
                color: '#f8fafc' 
            });
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // เคลียร์ค่า input เพื่อให้สามารถเลือกไฟล์เดิมซ้ำได้
}
