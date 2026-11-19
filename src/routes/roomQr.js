
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { db } = require('../config/firebase');
const { distanceMeters } = require('../utils/geo');

const router = express.Router();

const FACULTY_LAT = 7.166300;
const FACULTY_LNG = 100.611800;
const ALLOW_RADIUS = 50;

const nowBangkok = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
};

const toMinutes = value => {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return NaN;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

const newToken = () => crypto.randomBytes(32).toString('hex');

const isAdmin = req =>
  req.session.user?.role === 'admin';

const isOwner = (booking, user) => {
  const ids = [
    user.id,
    user.studentId,
    user.teacherId
  ].filter(Boolean).map(String);

  return [
    booking.userId,
    booking.bookerId,
    booking.studentId,
    booking.teacherId
  ].filter(Boolean).some(id => ids.includes(String(id)));
};

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!isAdmin(req)) return res.redirect('/dashboard');
  next();
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// ป้องกัน POST จากเว็บไซต์ภายนอก
router.use((req, res, next) => {
  if (req.method !== 'POST') return next();

  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;

  if (origin && origin !== expected) {
    return res.status(403).send('Invalid request origin');
  }
  next();
});

// หน้า Admin จัดการห้องและ QR
router.get('/admin/room-qrcodes', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('rooms').get();

    const rooms = await Promise.all(snap.docs.map(async doc => {
      const room = { id: doc.id, ...doc.data() };
      let qrImage = null;

      if (room.qrToken) {
        const url = `${req.protocol}://${req.get('host')}/room-qr/${room.qrToken}`;
        qrImage = await QRCode.toDataURL(url, { width: 240 });
      }

      return { ...room, qrImage };
    }));

    rooms.sort((a, b) =>
      String(a.roomName || '').localeCompare(
        String(b.roomName || ''), 'th'
      )
    );

    res.render('pages/admin/roomQrcodes', {
      title: 'จัดการ QR ห้องซ้อม',
      user: req.session.user,
      rooms
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('ไม่สามารถโหลดข้อมูลห้องซ้อม');
  }
});

// เพิ่มห้องใหม่พร้อมรหัส QR
router.post('/admin/room-qrcodes/create', requireAdmin, async (req, res) => {
  const roomName = String(req.body.roomName || '').trim();
  const roomType = String(req.body.roomType || '').trim();
  const roomNo = String(req.body.roomNo || '').trim();

  if (!roomName || !roomType) {
    req.flash('error', 'กรุณากรอกชื่อและประเภทห้อง');
    return res.redirect('/admin/room-qrcodes');
  }

  try {
    await db.collection('rooms').add({
      roomName,
      roomType,
      roomNo,
      status: 'active',
      qrOnly: false,
      qrToken: newToken(),
      qrCreatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    req.flash('success', 'เพิ่มห้องและสร้าง QR แล้ว');
  } catch (error) {
    console.error(error);
    req.flash('error', 'เพิ่มห้องไม่สำเร็จ');
  }

  res.redirect('/admin/room-qrcodes');
});

// สร้าง QR ให้ห้องเดิมที่ยังไม่มีรหัส
router.post('/admin/room-qrcodes/:id/generate', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('rooms').doc(req.params.id);

    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error('ไม่พบห้องซ้อม');

      if (!doc.data().qrToken) {
        tx.update(ref, {
          qrToken: newToken(),
          qrCreatedAt: new Date().toISOString()
        });
      }
    });

    req.flash('success', 'สร้าง QR เรียบร้อย');
  } catch (error) {
    req.flash('error', error.message);
  }

  res.redirect('/admin/room-qrcodes');
});

// ออก QR ใหม่: รหัสเก่าจะใช้ไม่ได้ทันที
router.post('/admin/room-qrcodes/:id/rotate', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('rooms').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('ไม่พบห้องซ้อม');

    await ref.update({
      qrToken: newToken(),
      qrCreatedAt: new Date().toISOString()
    });

    req.flash('success', 'ออก QR ใหม่แล้ว กรุณาเปลี่ยนป้ายหน้าห้อง');
  } catch (error) {
    req.flash('error', error.message);
  }

  res.redirect('/admin/room-qrcodes');
});

// ดาวน์โหลด QR เป็น PNG (Admin เท่านั้น)
router.get('/admin/room-qrcodes/:id/png', requireAdmin, async (req, res) => {
  const doc = await db.collection('rooms').doc(req.params.id).get();
  if (!doc.exists || !doc.data().qrToken) {
    return res.status(404).send('ไม่พบ QR');
  }

  const url = `${req.protocol}://${req.get('host')}/room-qr/${doc.data().qrToken}`;
  const png = await QRCode.toBuffer(url, {
    type: 'png',
    width: 900,
    margin: 3
  });

  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition',
    `attachment; filename="room-${req.params.id}.png"`);
  res.send(png);
});

// หน้าสแกน QR
router.get('/room-qr/:token', requireLogin, async (req, res) => {
  const snap = await db.collection('rooms')
    .where('qrToken', '==', req.params.token)
    .limit(1)
    .get();

  if (snap.empty) return res.status(404).send('QR ไม่ถูกต้อง');

  const roomDoc = snap.docs[0];
  const room = { id: roomDoc.id, ...roomDoc.data() };

  if (room.status !== 'active') {
    return res.status(403).send('ห้องนี้ปิดใช้งาน');
  }

  res.render('pages/roomQr/checkin', {
    title: 'QR เช็คอินห้องซ้อม',
    user: req.session.user,
    room,
    token: req.params.token
  });
});

// เช็คอินเฉพาะรายการจองของห้องและเวลานั้น
router.post('/room-qr/:token/checkin', requireLogin, async (req, res) => {
  const user = req.session.user;
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  const { date, minutes } = nowBangkok();

  const redirect = `/room-qr/${req.params.token}`;

  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    req.flash('error', 'กรุณาเปิด GPS และอนุญาตตำแหน่ง');
    return res.redirect(redirect);
  }

  const distance = distanceMeters(
    FACULTY_LAT, FACULTY_LNG, lat, lng
  );

  if (distance > ALLOW_RADIUS) {
    req.flash('error', 'คุณอยู่นอกพื้นที่อนุญาต');
    return res.redirect(redirect);
  }

  try {
    const roomSnap = await db.collection('rooms')
      .where('qrToken', '==', req.params.token)
      .limit(1)
      .get();

    if (roomSnap.empty) {
      return res.status(404).send('QR ไม่ถูกต้องหรือหมดอายุ');
    }

    const roomDoc = roomSnap.docs[0];

    if (roomDoc.data().status !== 'active') {
      return res.status(403).send('ห้องปิดใช้งาน');
    }

    const bookingSnap = await db.collection('bookings')
      .where('roomId', '==', roomDoc.id)
      .where('bookingDate', '==', date)
      .get();

    const eligible = bookingSnap.docs.filter(doc => {
      const b = doc.data();

      if (b.status !== 'approved') return false;
      if (!isOwner(b, user)) return false;

      const start = toMinutes(b.startTime);
      const end = toMinutes(b.endTime);

      return Number.isFinite(start) &&
        Number.isFinite(end) &&
        minutes >= start - 15 &&
        minutes <= end;
    });

    if (!eligible.length) {
      req.flash('error',
        'ไม่พบการจองที่อนุมัติแล้วตรงกับห้องและเวลาปัจจุบัน');
      return res.redirect(redirect);
    }

    const bookingDoc = eligible[0];
    const bookingRef = bookingDoc.ref;
    const logRef = db.collection('room_usage_logs')
      .doc(`qr_${bookingDoc.id}`);

    const now = new Date().toISOString();

    const result = await db.runTransaction(async tx => {
      const [bookingSnapshot, logSnapshot, latestRoom] =
        await Promise.all([
          tx.get(bookingRef),
          tx.get(logRef),
          tx.get(roomDoc.ref)
        ]);

      if (
        !bookingSnapshot.exists ||
        !latestRoom.exists ||
        latestRoom.data().status !== 'active' ||
        latestRoom.data().qrToken !== req.params.token
      ) {
        throw new Error('ข้อมูลห้องมีการเปลี่ยนแปลง');
      }

      const b = bookingSnapshot.data();

      if (
        b.status !== 'approved' ||
        b.roomId !== roomDoc.id ||
        b.bookingDate !== date ||
        !isOwner(b, user)
      ) {
        throw new Error('รายการจองไม่ถูกต้อง');
      }

      if (b.checkedInAt || b.usageStatus === 'checked_in' ||
          logSnapshot.exists) {
        return 'duplicate';
      }

      tx.set(bookingRef, {
        usageStatus: 'checked_in',
        usageStatusTH: 'เข้าใช้งาน',
        checkedInAt: now,
        checkinLatitude: lat,
        checkinLongitude: lng,
        checkinDistance: distance
      }, { merge: true });

      tx.create(logRef, {
        bookingId: bookingDoc.id,
        roomId: roomDoc.id,
        roomName: latestRoom.data().roomName || '',
        userId: user.id || '',
        studentId: user.studentId || '',
        studentName: user.name || '',
        bookingDate: date,
        usageDate: date,
        startTime: b.startTime || '',
        endTime: b.endTime || '',
        usageStatus: 'checked_in',
        usageStatusTH: 'เข้าใช้งาน',
        scanType: 'room_qr_gps_checkin',
        latitude: lat,
        longitude: lng,
        distance,
        checkedInAt: now,
        createdAt: now
      });

      return 'success';
    });

    req.flash(
      result === 'success' ? 'success' : 'error',
      result === 'success'
        ? 'เช็คอินห้องซ้อมสำเร็จ'
        : 'รายการจองนี้เช็คอินแล้ว'
    );
  } catch (error) {
    console.error('Room QR error:', error);
    req.flash('error', error.message || 'เช็คอินไม่สำเร็จ');
  }

  res.redirect(redirect);
});

module.exports = router;
