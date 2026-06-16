const express = require('express');
const { db } = require('../config/firebase');
const { distanceMeters } = require('../utils/geo');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/:token', (req, res) => {
  res.render('pages/checkin', {
    title: 'Check-in',
    token: req.params.token,
    user: req.session.user
  });
});

router.post('/:token', requireLogin, async (req, res) => {
  const snap = await db.collection('qr_sessions')
    .where('qrToken', '==', req.params.token)
    .limit(1)
    .get();

  if (snap.empty) {
    return res.status(404).render('pages/error', {
      title: 'QR ไม่ถูกต้อง',
      message: 'ไม่พบ QR session',
      user: req.session.user
    });
  }

  const session = {
    id: snap.docs[0].id,
    ...snap.docs[0].data()
  };

  if (new Date(session.expireTime) < new Date()) {
    return res.render('pages/error', {
      title: 'หมดอายุ',
      message: 'QR Code หมดอายุแล้ว',
      user: req.session.user
    });
  }

  const studentId = req.session.user.studentId || req.session.user.id;
  const studentName = req.session.user.name || '';

  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);

  const baseLat = Number(session.classLatitude);
  const baseLng = Number(session.classLongitude);

  if (!baseLat || !baseLng) {
    return res.render('pages/error', {
      title: 'ยังไม่ได้ตั้งค่าพิกัด',
      message: 'QR นี้ยังไม่มีพิกัดห้องเรียนสำหรับตรวจสอบระยะ',
      user: req.session.user
    });
  }

  const dist = distanceMeters(baseLat, baseLng, lat, lng);

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const courseDoc = session.courseId
    ? await db.collection('courses').doc(session.courseId).get()
    : null;

  const course = courseDoc && courseDoc.exists ? courseDoc.data() : {};

  const duplicateSnap = await db.collection('attendance')
    .where('studentId', '==', studentId)
    .where('qrSessionId', '==', session.id)
    .limit(1)
    .get();

  if (!duplicateSnap.empty) {
    return res.render('pages/error', {
      title: 'เช็คชื่อซ้ำ',
      message: 'คุณเช็คชื่อรายการนี้ไปแล้ว',
      user: req.session.user
    });
  }

  await db.collection('attendance').add({
    qrSessionId: session.id,

    studentId,
    studentName,

    courseId: session.courseId || '',
    courseCode: session.courseCode || course.courseCode || '',
    courseName: session.courseName || course.courseName || '',
    groupCode: session.groupCode || course.groupCode || '',
    courseGroupCode: session.courseGroupCode || course.courseGroupCode || '',

    teacherId: session.teacherId || course.teacherId || '',
    teacherName: session.teacherName || course.teacherName || '',

    semesterId: session.semesterId || course.semesterId || '',

    status: 'มาเรียน',
    attendanceStatus: 'มาเรียน',

    checkDate: today,
    attendanceDate: today,
    checkTime: now,
    checkInTime: now,

    latitude: lat,
    longitude: lng,
    distance: dist,
    locationStatus: dist <= 50 ? 'ในพื้นที่' : 'นอกพื้นที่',

    note: dist <= 50 ? '' : 'เช็คชื่อนอกพื้นที่',

    createdAt: now
  });

  res.render('pages/success', {
    title: 'เช็คชื่อสำเร็จ',
    message: `บันทึกแล้ว (${dist.toFixed(0)} เมตร / ${dist <= 50 ? 'ในพื้นที่' : 'นอกพื้นที่'})`,
    user: req.session.user
  });
});

module.exports = router;