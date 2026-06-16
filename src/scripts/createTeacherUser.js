require('dotenv').config();

const { db } = require('../config/firebase');
const { hashPassword } = require('../utils/password');

async function createTeacherUser() {
  const teacherId = 'D001';
  const plainPassword = 'D001@1234';

  const passwordHash = await hashPassword(plainPassword);

  await db.collection('users').doc(teacherId).set({
    userId: teacherId,
    teacherId,
    role: 'teacher',
    type: 'teacher',
    name: 'อาจารย์ test',
    email: 'teacher@chup.com',
    phone: '0911234567',
    lineUserId: '-',
    status: 'approved',
    passwordHash,
    createdAt: '2026-06-14T13:38:38.223Z',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  console.log('Create teacher user success');
  console.log('Email: teacher@chup.com');
  console.log('Password: ' + plainPassword);

  process.exit(0);
}

createTeacherUser().catch(err => {
  console.error(err);
  process.exit(1);
});