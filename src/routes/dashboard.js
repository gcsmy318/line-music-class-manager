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

router.get('/', requireLogin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

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
    db.collection('users').where('status', '==', 'pending').get(),
    db.collection('attendance').where('checkDate', '==', today).get().catch(() => ({ size: 0 })),
    db.collection('submissions').where('submitDate', '==', today).get().catch(() => ({ size: 0 })),
    db.collection('bookings').where('bookingDate', '==', today).get().catch(() => ({ size: 0 })),
    db.collection('bookings').where('status', '==', 'pending').get().catch(() => ({ size: 0 }))
  ]);

  res.render('pages/dashboard', {
    title: 'หน้าหลัก',
    user: req.session.user,
    today,
    stats: {
      users,
      students,
      teachers,
      courses,
      rooms,
      pendingUsers: pendingUsers.size,
      todayAttendance: todayAttendance.size,
      todaySubmissions: todaySubmissions.size,
      todayBookings: todayBookings.size,
      pendingBookings: pendingBookings.size
    }
  });
});

module.exports = router;