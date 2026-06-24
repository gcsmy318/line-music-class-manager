require('dotenv').config();

const { db } = require('../config/firebase');

async function run() {
  const snap = await db.collection('attendance').get();

  console.log(`พบ ${snap.size} รายการ`);

  let updateCount = 0;
  const batch = db.batch();

  snap.docs.forEach(doc => {
    const data = doc.data();
    const distance = Number(data.distance || 0);

    if (data.locationStatus === 'นอกพื้นที่' && distance <= 200) {
      batch.update(doc.ref, {
        locationStatus: 'ในพื้นที่',
        note: ''
      });

      updateCount++;
    }
  });

  if (updateCount === 0) {
    console.log('ไม่มีรายการที่ต้องแก้');
    process.exit(0);
  }

  await batch.commit();

  console.log(`แก้ไขสำเร็จ ${updateCount} รายการ`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});