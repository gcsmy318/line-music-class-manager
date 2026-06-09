const ExcelJS = require('exceljs');
const { db } = require('../config/firebase');
const { hashPassword, generatePassword } = require('../utils/password');

async function importStudents(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => headers[col] = String(cell.value).trim());
  const result = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (!row.getCell(1).value) continue;
    const item = {};
    headers.forEach((h, col) => item[h] = row.getCell(col).value ? String(row.getCell(col).value).trim() : '');
    const studentId = item.studentId || item['รหัสนิสิต'];
    const fullName = item.fullName || item['ชื่อ-สกุล'];
    const email = item.email || item['อีเมล'] || '';
    const phone = item.phone || item['เบอร์โทรศัพท์'] || '';
    const password = generatePassword('STU');
    const userRef = await db.collection('users').add({
      role:'student', name:fullName, email, phone, passwordHash: await hashPassword(password),
      status:'approved', createdAt:new Date().toISOString(), approvedAt:new Date().toISOString(), rawPasswordForFirstSend: password
    });
    await db.collection('students').add({
      studentId, userId:userRef.id, fullName, phone, email,
      major:item.major || item['วิชาเอก'] || '', year:item.year || item['ชั้นปี'] || '',
      mainInstrument:item.mainInstrument || item['เครื่องดนตรีหลัก'] || '', createdAt:new Date().toISOString()
    });
    result.push({ studentId, fullName, password });
  }
  return result;
}
module.exports = { importStudents };
