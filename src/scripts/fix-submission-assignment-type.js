require('dotenv').config();

const { db } = require('../config/firebase');

async function run() {

  console.log('Start update submissions...');

  const snap = await db.collection('submissions').get();

  let count = 0;

  const batch = db.batch();

  snap.docs.forEach(doc => {

    const data = doc.data();

    if (!data.assignmentType) {

      batch.set(doc.ref, {
        assignmentType: 'อื่นๆ',
        assignmentTitle: data.assignmentTitle || ''
      }, { merge: true });

      count++;
    }

  });

  if (count > 0) {
    await batch.commit();
  }

  console.log(`Updated ${count} records`);
  process.exit(0);

}

run().catch(err => {
  console.error(err);
  process.exit(1);
});