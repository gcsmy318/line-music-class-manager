const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

async function countCollection(name) {
  const snap = await db.collection(name).get();
  return snap.size;
}

async function safeCount(query) {
  try {
    const snap = await query.get();
    return snap.size;
  } catch (e) {
    return 0;
  }
}

router.get('/', requireLogin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const user = req.session.user;
  const role = user.role;

  let stats = {};

  if (role === 'admin') {
    const [
      users,
      students,
      teachers,
      courses,
      rooms,
      pendingUsers,
      todayAttendance,
      todaySubmissions,
      todayBookings,
      pendingBookings
    ] = await Promise.all([
      countCollection('users'),
      countCollection('students'),
      countCollection('teachers'),
      countCollection('courses'),
      countCollection('rooms'),
      safeCount(db.collection('users').where('status', '==', 'pending')),
      safeCount(db.collection('attendance').where('checkDate', '==', today)),
      safeCount(db.collection('submissions').where('submitDate', '==', today)),
      safeCount(db.collection('bookings').where('bookingDate', '==', today)),
      safeCount(db.collection('bookings').where('status', '==', 'pending'))
    ]);

    stats = {
      users,
      students,
      teachers,
      courses,
      rooms,
      pendingUsers,
      todayAttendance,
      todaySubmissions,
      todayBookings,
      pendingBookings
    };
  }

  if (role === 'teacher') {
    stats = {
      courses: await safeCount(db.collection('courses').where('teacherId', '==', user.id)),
      todayAttendance: await safeCount(db.collection('attendance').where('teacherId', '==', user.id).where('checkDate', '==', today)),
      todaySubmissions: await safeCount(db.collection('submissions').where('teacherId', '==', user.id).where('submitDate', '==', today)),
      pendingSubmissions: await safeCount(db.collection('submissions').where('teacherId', '==', user.id).where('status', '==', 'ยังไม่ตรวจ'))
    };
  }

  if (role === 'staff') {
    stats = {
      rooms: await countCollection('rooms'),
      todayBookings: await safeCount(db.collection('bookings').where('bookingDate', '==', today)),
      pendingBookings: await safeCount(db.collection('bookings').where('status', '==', 'pending'))
    };
  }

  if (role === 'student') {
    stats = {
      myCourses: await safeCount(db.collection('enrollments').where('studentId', '==', user.id)),
      myAttendance: await safeCount(db.collection('attendance').where('studentId', '==', user.id)),
      mySubmissions: await safeCount(db.collection('submissions').where('studentId', '==', user.id)),
      myBookings: await safeCount(db.collection('bookings').where('studentId', '==', user.id))
    };
  }

  res.render('pages/dashboard', {
    title: 'หน้าหลัก',
    user,
    today,
    stats
  });
});

module.exports = router;