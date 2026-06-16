require('dotenv').config();

const { db } = require('../config/firebase');

async function fixOldBookings() {
  const snap = await db.collection('bookings').get();

  let fixed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const b = doc.data();

    const update = {};

    // ถ้ายังไม่มี userId ให้ใช้ studentId เดิม
    if (!b.userId && b.studentId) {
      update.userId = b.studentId;
    }

    // ถ้า studentName เป็น System Admin ให้เปลี่ยนภายหลังเองใน Firestore ได้
    // หรือปล่อยไว้ก็ได้ เพราะระบบเช็คอินดูจาก studentId/userId เป็นหลัก

    if (Object.keys(update).length > 0) {
      await doc.ref.set(update, { merge: true });
      fixed++;
      console.log('FIXED:', doc.id, update);
    } else {
      skipped++;
    }
  }

  console.log('--------------------');
  console.log('Fix old bookings done');
  console.log('Fixed:', fixed);
  console.log('Skipped:', skipped);
  process.exit(0);
}

fixOldBookings().catch(err => {
  console.error(err);
  process.exit(1);
});