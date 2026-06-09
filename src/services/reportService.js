const ExcelJS = require('exceljs');
const { db } = require('../config/firebase');

async function exportCollection(collection) {
  const snap = await db.collection(collection).limit(5000).get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(collection);
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  sheet.columns = keys.map(k => ({ header: k, key: k, width: 22 }));
  rows.forEach(r => sheet.addRow(r));
  return workbook.xlsx.writeBuffer();
}
module.exports = { exportCollection };
