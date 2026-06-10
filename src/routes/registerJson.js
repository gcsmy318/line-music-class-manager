const express = require('express');
const { db } = require('../config/firebase');
const { generatePassword, hashPassword } = require('../utils/password');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.redirect('/dashboard');
  next();
}

router.get('/', requireAdmin, (req, res) => {
  res.render('pages/admin/registerJson', {
    title: 'ลงทะเบียนแทนด้วย JSON',
    user: req.session.user
  });
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const data = JSON.parse(req.body.jsonText);

    if (!data.role || !data.id || !data.name || !data.email) {
      req.flash('error', 'JSON ต้องมี role, id, name, email');
      return res.redirect('/admin/register-json');
    }

    const prefix =
      data.role === 'student' ? 'STU' :
      data.role === 'teacher' ? 'TCH' :
      data.role === 'staff' ? 'STF' : 'USR';

    const plainPassword = generatePassword(prefix);
    const passwordHash = await hashPassword(plainPassword);

    await db.collection('users').doc(data.id).set({
      userId: data.id,
      role: data.role,
      name: data.name,
      phone: data.phone || '',
      email: data.email,
      lineUserId: data.lineUserId || '',
      status: 'approved',
      passwordHash,
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }, { merge: true });

    if (data.role === 'student') {
      await db.collection('students').doc(data.id).set({
        studentId: data.id,
        fullName: data.name,
        phone: data.phone || '',
        email: data.email,
        major: data.major || '',
        year: data.year || '',
        mainInstrument: data.mainInstrument || '',
        workPlace: data.workPlace || '',
        workHoursPerWeek: data.workHoursPerWeek || '',
        income: data.income || '',
        createdAt: new Date().toISOString()
      }, { merge: true });
    }

    if (data.role === 'teacher') {
      await db.collection('teachers').doc(data.id).set({
        teacherId: data.id,
        fullName: data.name,
        phone: data.phone || '',
        email: data.email,
        department: data.department || '',
        instrument: data.instrument || '',
        createdAt: new Date().toISOString()
      }, { merge: true });
    }

    if (data.role === 'staff') {
      await db.collection('staff').doc(data.id).set({
        staffId: data.id,
        fullName: data.name,
        phone: data.phone || '',
        email: data.email,
        position: data.position || '',
        createdAt: new Date().toISOString()
      }, { merge: true });
    }

    req.flash('success', `ลงทะเบียนสำเร็จ รหัสผ่านคือ: ${plainPassword}`);
    res.redirect('/admin/register-json');

  } catch (err) {
    req.flash('error', 'JSON ไม่ถูกต้อง: ' + err.message);
    res.redirect('/admin/register-json');
  }
});

module.exports = router;