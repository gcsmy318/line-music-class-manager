const express = require('express');
const { db } = require('../config/firebase');
const { distanceMeters } = require('../utils/geo');

const router = express.Router();

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect('/login');


  if (!['student', 'admin', 'staff'].includes(req.session.user.role)) {
      return res.redirect('/dashboard');
  }

  next();
}

const FACULTY_LAT = 7.166300;
const FACULTY_LNG = 100.611800;
const ALLOW_RADIUS_METERS = 50;

function getUserIds(req) {
  const userId = req.session.user.id;
  const studentId = req.session.user.studentId || req.session.user.id;

  return { userId, studentId };
}

router.get('/', requireStudent, async (req, res) => {


  console.log('ROOM CONFIRM OPEN');
  console.log(req.session.user);

  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = req.query.date || today;

  const { userId, studentId } = getUserIds(req);

  const snap = await db.collection('bookings')
    .where('bookingDate', '==', selectedDate)
    .where('status', '==', 'approved')
    .get();

  const bookings = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b =>
      b.studentId === studentId ||
      b.studentId === userId ||
      b.userId === userId
    );

  res.render('pages/roomConfirm/index', {
    title: 'เช็คอินใช้ห้องซ้อม',
    user: req.session.user,
    selectedDate,
    bookings,
    facultyLat: FACULTY_LAT,
    facultyLng: FACULTY_LNG,
    allowRadius: ALLOW_RADIUS_METERS
  });
});

router.post('/checkin', requireStudent, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const userId = req.session.user.id;
  const studentId = req.session.user.studentId || req.session.user.id;
  const studentName = req.session.user.name || '';

  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);

  if (!lat || !lng) {
    req.flash('error', 'ไม่พบพิกัด GPS กรุณาอนุญาตตำแหน่งใน Browser');
    return res.redirect('/room-confirm');
  }

  const dist = distanceMeters(FACULTY_LAT, FACULTY_LNG, lat, lng);

  if (dist > ALLOW_RADIUS_METERS) {
    req.flash(
      'error',
      `คุณอยู่นอกพื้นที่คณะดุริยาง ม.ทักษิณ สงขลา ระยะประมาณ ${dist.toFixed(0)} เมตร`
    );

    return res.redirect('/room-confirm');
  }

  const snap = await db.collection('bookings')
    .where('bookingDate', '==', today)
    .where('status', '==', 'approved')
    .get();

  const docs = snap.docs.filter(doc => {
    const b = doc.data();

    return (
      b.studentId === studentId ||
      b.studentId === userId ||
      b.userId === userId
    );
  });

  if (docs.length === 0) {
    req.flash('error', 'ไม่พบรายการจองที่อนุมัติแล้วของคุณในวันนี้');
    return res.redirect('/room-confirm');
  }

  const batch = db.batch();

  docs.forEach(doc => {
    const b = doc.data();

    batch.set(doc.ref, {
      usageStatus: 'checked_in',
      usageStatusTH: 'เข้าใช้งาน',
      checkedInAt: now,
      checkinLatitude: lat,
      checkinLongitude: lng,
      checkinDistance: dist,
      checkinLocationStatus: 'อยู่ในพื้นที่คณะดุริยาง'
    }, { merge: true });

    const logRef = db.collection('room_usage_logs').doc();

    batch.set(logRef, {
      bookingId: doc.id,
      userId,
      studentId,
      studentName,
      roomId: b.roomId || '',
      roomName: b.roomName || '',
      bookingDate: b.bookingDate || today,
      startTime: b.startTime || '',
      endTime: b.endTime || '',
      usageStatus: 'checked_in',
      usageStatusTH: 'เข้าใช้งาน',
      scanType: 'web_gps_checkin',
      latitude: lat,
      longitude: lng,
      distance: dist,
      usageDate: today,
      checkedInAt: now,
      createdAt: now
    });
  });

  await batch.commit();

  req.flash(
    'success',
    `เช็คอินสำเร็จ ระบบปรับสถานะรายการจองวันนี้ของคุณเป็น "เข้าใช้งาน" แล้ว (${dist.toFixed(0)} เมตร)`
  );

  res.redirect('/room-confirm');
});

module.exports = router;