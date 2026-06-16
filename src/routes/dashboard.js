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

async function countQuery(query) {
  const snap = await query.get();
  return snap.size;
}

router.get('/', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = user.role;
  const today = new Date().toISOString().slice(0, 10);

  let stats = {};

  if (role === 'admin') {
    const [
      users,
      students,
      teachers,
      staff,
      courses,
      semesters,
      rooms,
      bookings,
      pendingUsers,
      pendingBookings,
      todayAttendance,
      todaySubmissions
    ] = await Promise.all([
      countCollection('users'),
      countCollection('students'),
      countQuery(db.collection('users').where('role', '==', 'teacher')),
      countQuery(db.collection('users').where('role', '==', 'staff')),
      countCollection('courses'),
      countCollection('semesters'),
      countCollection('rooms'),
      countCollection('bookings'),
      countQuery(db.collection('users').where('status', '==', 'pending')),
      countQuery(db.collection('bookings').where('status', '==', 'pending')),
      countQuery(db.collection('attendance').where('checkDate', '==', today)),
      countQuery(db.collection('submissions').where('submitDate', '==', today))
    ]);

    stats = {
      users,
      students,
      teachers,
      staff,
      courses,
      semesters,
      rooms,
      bookings,
      pendingUsers,
      pendingBookings,
      todayAttendance,
      todaySubmissions
    };
  }

  if (role === 'staff') {
    const [
      rooms,
      allBookings,
      todayBookings,
      futureBookings,
      pendingBookings,
      approvedBookings,
      roomUsage
    ] = await Promise.all([
      countCollection('rooms'),
      countCollection('bookings'),
      countQuery(db.collection('bookings').where('bookingDate', '==', today)),
      countQuery(db.collection('bookings').where('bookingDate', '>', today)),
      countQuery(db.collection('bookings').where('status', '==', 'pending')),
      countQuery(db.collection('bookings').where('status', '==', 'approved')),
      countCollection('room_usage_logs')
    ]);

    stats = {
      rooms,
      allBookings,
      todayBookings,
      futureBookings,
      pendingBookings,
      approvedBookings,
      roomUsage
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