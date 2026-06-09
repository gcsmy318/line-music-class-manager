
require('dotenv').config();

const { db } = require('../config/firebase');

async function seedRooms() {
  const batch = db.batch();

  for (let i = 1; i <= 19; i++) {
    const ref = db.collection('rooms').doc('PIANO_' + i);

    batch.set(ref, {
      roomCode: 'PIANO_' + i,
      roomName: 'ห้องเปียโน ' + i,
      roomNo: i,
      roomType: 'piano',
      building: 'Music',
      openTime: '08:00',
      closeTime: '19:00',
      status: 'active',
      needApproval: true,
      createdAt: new Date().toISOString()
    });
  }

  batch.set(db.collection('rooms').doc('VOCAL_20'), {
    roomCode: 'VOCAL_20',
    roomName: 'ห้องซ้อมย่อยขับร้อง 20',
    roomNo: 20,
    roomType: 'vocal',
    building: 'Music',
    openTime: '08:00',
    closeTime: '19:00',
    status: 'active',
    needApproval: true,
    createdAt: new Date().toISOString()
  });

  batch.set(db.collection('rooms').doc('MUSIC_LIBRARY'), {
    roomCode: 'MUSIC_LIBRARY',
    roomName: 'ห้องสมุดดนตรี',
    roomType: 'library',
    computerCount: 3,
    openTime: '08:00',
    closeTime: '17:00',
    status: 'active',
    qrOnly: true,
    createdAt: new Date().toISOString()
  });

  batch.set(db.collection('rooms').doc('MUSIC_COMPUTER'), {
    roomCode: 'MUSIC_COMPUTER',
    roomName: 'ห้องคอมพิวเตอร์ดนตรี',
    roomType: 'computer',
    computerCount: 45,
    openTime: '08:00',
    closeTime: '17:00',
    status: 'active',
    qrOnly: true,
    createdAt: new Date().toISOString()
  });

  await batch.commit();

  console.log('Seed rooms success');
  process.exit(0);
}

seedRooms().catch(err => {
  console.error(err);
  process.exit(1);
});