const express = require('express');
const { db } = require('../config/firebase');

const router = express.Router();

const multer = require('multer');
const sharp = require('sharp');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

async function fileToSmallDataUrl(file) {
  if (!file) return null;

  if (file.mimetype.startsWith('image/')) {
    let quality = 80;
    let buffer = await sharp(file.buffer)
      .resize({ width: 1000, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();

    while (buffer.length > 50 * 1024 && quality > 20) {
      quality -= 10;
      buffer = await sharp(file.buffer)
        .resize({ width: 900, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }

    return {
      attachmentName: file.originalname,
      attachmentType: 'image/jpeg',
      attachmentSize: buffer.length,
      attachmentDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`
    };
  }

  if (file.mimetype === 'application/pdf') {
    if (file.buffer.length > 50 * 1024) {
      throw new Error('ไฟล์ PDF ต้องไม่เกิน 50KB');
    }

    return {
      attachmentName: file.originalname,
      attachmentType: file.mimetype,
      attachmentSize: file.buffer.length,
      attachmentDataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
    };
  }

  throw new Error('รองรับเฉพาะรูปภาพหรือ PDF');
}



function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['student', 'admin'].includes(req.session.user.role)) {
    return res.redirect('/dashboard');
  }
  next();
}

function getMyId(req) {
  return req.session.user.studentId || req.session.user.id;
}

router.get('/', requireStudent, async (req, res) => {
  const studentId = getMyId(req);

  const [enrollments, leaves, submissions, bookings, attendance] = await Promise.all([
    db.collection('enrollments').where('studentId', '==', studentId).get(),
    db.collection('leave_requests').where('studentId', '==', studentId).get(),
    db.collection('submissions').where('studentId', '==', studentId).get(),
    db.collection('bookings').where('studentId', '==', studentId).get(),
    db.collection('attendance').where('studentId', '==', studentId).get()
  ]);

  res.render('pages/student/index', {
    title: 'ข้อมูลของฉัน',
    user: req.session.user,
    stats: {
      enrollments: enrollments.size,
      leaves: leaves.size,
      submissions: submissions.size,
      bookings: bookings.size,
      attendance: attendance.size
    }
  });
});

router.get('/enrollments', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const selectedSemesterId = req.query.semesterId || '';

  const semestersSnap = await db.collection('semesters').get();

  let coursesQuery = db.collection('courses').where('status', '==', 'active');

  if (selectedSemesterId) {
    coursesQuery = coursesQuery.where('semesterId', '==', selectedSemesterId);
  }

  const coursesSnap = await coursesQuery.get();

  const enrollSnap = await db.collection('enrollments')
    .where('studentId', '==', studentId)
    .get();

  const enrollments = enrollSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  res.render('pages/student/enrollments', {
    title: 'ลงทะเบียนรายวิชา',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    selectedSemesterId,
    courses: coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    enrollments,
    enrolledCourseIds: enrollments.map(e => e.courseId),
    enrolledCourseGroups: enrollments.map(e => e.courseGroupCode)
  });
});

router.post('/enrollments', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const { semesterId, courseId } = req.body;

  const courseDoc = await db.collection('courses').doc(courseId).get();

  if (!courseDoc.exists) {
    req.flash('error', 'ไม่พบรายวิชา');
    return res.redirect('/student/enrollments?semesterId=' + encodeURIComponent(semesterId || ''));
  }

  const course = courseDoc.data();

  const exists = await db.collection('enrollments')
    .where('studentId', '==', studentId)
    .where('courseId', '==', courseId)
    .limit(1)
    .get();

  if (!exists.empty) {
    req.flash('error', 'คุณลงทะเบียนรายวิชานี้แล้ว');
    return res.redirect('/student/enrollments?semesterId=' + encodeURIComponent(semesterId || ''));
  }

  await db.collection('enrollments').add({
    studentId,
    studentName: req.session.user.name || '',
    courseId,
    courseCode: course.courseCode || '',
    courseName: course.courseName || '',
    groupCode: course.groupCode || '',
    courseGroupCode: course.courseGroupCode || '',
    semesterId: semesterId || course.semesterId || '',
    teacherId: course.teacherId || '',
    teacherName: course.teacherName || '',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });

  req.flash('success', 'ส่งคำขอลงทะเบียนรายวิชาแล้ว รออาจารย์อนุมัติ');
  res.redirect('/student/enrollments?semesterId=' + encodeURIComponent(semesterId || course.semesterId || ''));
});

router.get('/leave', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const selectedSemesterId = req.query.semesterId || '';

  const semestersSnap = await db.collection('semesters').get();

console.log('LEAVE SEMESTERS SIZE:', semestersSnap.size);
console.log('LEAVE SEMESTERS DATA:', semestersSnap.docs.map(d => ({
  id: d.id,
  ...d.data()
})));


  let enrollQuery = db.collection('enrollments')
    .where('studentId', '==', studentId)
    .where('status', '==', 'approved');

  if (selectedSemesterId) {
    enrollQuery = enrollQuery.where('semesterId', '==', selectedSemesterId);
  }

  let leaveQuery = db.collection('leave_requests')
    .where('studentId', '==', studentId);

  if (selectedSemesterId) {
    leaveQuery = leaveQuery.where('semesterId', '==', selectedSemesterId);
  }

  const enrollSnap = await enrollQuery.get();
  const leaveSnap = await leaveQuery.get();

  res.render('pages/student/leave', {
    title: 'ลาเรียน',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    selectedSemesterId,
    enrollments: enrollSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    leaves: leaveSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  });
});

/*router.post('/leave', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const { semesterId, enrollmentId, leaveType, reason, leaveDate } = req.body;

  const enrollDoc = await db.collection('enrollments').doc(enrollmentId).get();

  if (!enrollDoc.exists) {
    req.flash('error', 'ไม่พบรายวิชา');
    return res.redirect('/student/leave');
  }

  const e = enrollDoc.data();

  await db.collection('leave_requests').add({
    studentId,
    studentName: req.session.user.name || '',
    enrollmentId,
    courseId: e.courseId || '',
    courseCode: e.courseCode || '',
    courseName: e.courseName || '',
    groupCode: e.groupCode || '',
    courseGroupCode: e.courseGroupCode || '',
    semesterId: semesterId || e.semesterId || '',
    teacherId: e.teacherId || '',
    teacherName: e.teacherName || '',
    leaveType,
    reason,
    leaveDate,
    status: 'recorded',
    createdAt: new Date().toISOString()
  });

  req.flash('success', 'บันทึกการลาเรียบร้อยแล้ว');
  res.redirect('/student/leave?semesterId=' + encodeURIComponent(semesterId || e.semesterId || ''));
});*/

router.post('/leave', requireStudent, upload.single('attachment'), async (req, res) => {
  const studentId = getMyId(req);
  const { semesterId, enrollmentId, leaveType, reason, leaveDate } = req.body;

  const enrollDoc = await db.collection('enrollments').doc(enrollmentId).get();

  if (!enrollDoc.exists) {
    req.flash('error', 'ไม่พบรายวิชา');
    return res.redirect('/student/leave');
  }

  const e = enrollDoc.data();

  let attachment = null;

  try {
    attachment = await fileToSmallDataUrl(req.file);
  } catch (err) {
    req.flash('error', err.message);
    return res.redirect('/student/leave?semesterId=' + encodeURIComponent(semesterId || e.semesterId || ''));
  }

  await db.collection('leave_requests').add({
    studentId,
    studentName: req.session.user.name || '',
    enrollmentId,
    courseId: e.courseId || '',
    courseCode: e.courseCode || '',
    courseName: e.courseName || '',
    groupCode: e.groupCode || '',
    courseGroupCode: e.courseGroupCode || '',
    semesterId: semesterId || e.semesterId || '',
    teacherId: e.teacherId || '',
    teacherName: e.teacherName || '',
    leaveType,
    reason,
    leaveDate,
    status: 'recorded',

    attachmentName: attachment?.attachmentName || '',
    attachmentType: attachment?.attachmentType || '',
    attachmentSize: attachment?.attachmentSize || 0,
    attachmentDataUrl: attachment?.attachmentDataUrl || '',

    createdAt: new Date().toISOString()
  });

  req.flash('success', 'บันทึกการลาเรียบร้อยแล้ว');
  res.redirect('/student/leave?semesterId=' + encodeURIComponent(semesterId || e.semesterId || ''));
});

router.get('/submissions', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const selectedSemesterId = req.query.semesterId || '';

  const semestersSnap = await db.collection('semesters').get();

  let enrollQuery = db.collection('enrollments')
    .where('studentId', '==', studentId)
    .where('status', '==', 'approved');

  if (selectedSemesterId) {
    enrollQuery = enrollQuery.where('semesterId', '==', selectedSemesterId);
  }

  const enrollSnap = await enrollQuery.get();

  let subQuery = db.collection('submissions')
    .where('studentId', '==', studentId);

  if (selectedSemesterId) {
    subQuery = subQuery.where('semesterId', '==', selectedSemesterId);
  }

  const subSnap = await subQuery.get();

  res.render('pages/student/submissions', {
    title: 'ส่งงาน',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    selectedSemesterId,
    enrollments: enrollSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    submissions: subSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  });
});

router.post('/submissions', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const { semesterId, enrollmentId, youtubeUrl, note } = req.body;

  const enrollDoc = await db.collection('enrollments').doc(enrollmentId).get();

  if (!enrollDoc.exists) {
    req.flash('error', 'ไม่พบรายวิชา');
    return res.redirect('/student/submissions');
  }

  const e = enrollDoc.data();

  await db.collection('submissions').add({
    studentId,
    studentName: req.session.user.name || '',
    enrollmentId,
    courseId: e.courseId || '',
    courseCode: e.courseCode || '',
    courseName: e.courseName || '',
    groupCode: e.groupCode || '',
    courseGroupCode: e.courseGroupCode || '',
    semesterId: semesterId || e.semesterId || '',
    teacherId: e.teacherId || '',
    teacherName: e.teacherName || '',
    youtubeUrl,
    note: note || '',
    score: '',
    feedback: '',
    suggestion: '',
    status: 'ยังไม่ตรวจ',
    submitDate: new Date().toISOString().slice(0, 10),
    submitTime: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });

  req.flash('success', 'ส่งงานเรียบร้อยแล้ว');
  res.redirect('/student/submissions?semesterId=' + encodeURIComponent(semesterId || e.semesterId || ''));
});

router.get('/attendance', requireStudent, async (req, res) => {
  const studentId = getMyId(req);

  const selectedSemesterId = req.query.semesterId || '';
  const selectedCourseGroupCode = req.query.courseGroupCode || '';

  const semestersSnap = await db.collection('semesters').get();

  let enrollQuery = db.collection('enrollments')
    .where('studentId', '==', studentId)
    .where('status', '==', 'approved');

  if (selectedSemesterId) {
    enrollQuery = enrollQuery.where('semesterId', '==', selectedSemesterId);
  }

  const enrollSnap = await enrollQuery.get();

  let attendanceQuery = db.collection('attendance')
    .where('studentId', '==', studentId);

  if (selectedSemesterId) {
    attendanceQuery = attendanceQuery.where(
      'semesterId',
      '==',
      selectedSemesterId
    );
  }

  const attendanceSnap = await attendanceQuery.get();

  let leaveQuery = db.collection('leave_requests')
    .where('studentId', '==', studentId);

  if (selectedSemesterId) {
    leaveQuery = leaveQuery.where(
      'semesterId',
      '==',
      selectedSemesterId
    );
  }

  const leaveSnap = await leaveQuery.get();

  let records = [];

  attendanceSnap.docs.forEach(doc => {
    const d = doc.data();

    if (
      selectedCourseGroupCode &&
      d.courseGroupCode !== selectedCourseGroupCode
    ) return;

    records.push({
      type: 'attendance',
      date: d.checkDate || d.attendanceDate || '',
      courseCode: d.courseCode,
      courseName: d.courseName,
      groupCode: d.groupCode,
      courseGroupCode: d.courseGroupCode,
      status: d.attendanceStatus || d.status || 'มาเรียน',
      note: d.note || ''
    });
  });

  leaveSnap.docs.forEach(doc => {
    const d = doc.data();

    if (
      selectedCourseGroupCode &&
      d.courseGroupCode !== selectedCourseGroupCode
    ) return;

    records.push({
      type: 'leave',
      date: d.leaveDate,
      courseCode: d.courseCode,
      courseName: d.courseName,
      groupCode: d.groupCode,
      courseGroupCode: d.courseGroupCode,
      status: d.leaveType,
      reason: d.reason
    });
  });

  records.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );

  const summary = {
    present: records.filter(
      r =>
        r.type === 'attendance' &&
        r.status === 'มาเรียน'
    ).length,

    late: records.filter(
      r =>
        r.type === 'attendance' &&
        r.status === 'มาสาย'
    ).length,

    absent: records.filter(
      r =>
        r.type === 'attendance' &&
        r.status === 'ขาดเรียน'
    ).length,

    leave: records.filter(
      r => r.type === 'leave'
    ).length,

    total: records.length
  };

  res.render('pages/student/attendance', {
    title: 'การเข้าเรียนของฉัน',
    user: req.session.user,

    semesters: semestersSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })),

    enrollments: enrollSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })),

    records,
    summary,

    selectedSemesterId,
    selectedCourseGroupCode
  });
});

router.get('/course-records', requireStudent, async (req, res) => {
  const studentId = getMyId(req);
  const selectedSemesterId = req.query.semesterId || '';

  const semestersSnap = await db.collection('semesters').get();

  let enrollQuery = db.collection('enrollments')
    .where('studentId', '==', studentId)
    .where('status', '==', 'approved');

  if (selectedSemesterId) {
    enrollQuery = enrollQuery.where('semesterId', '==', selectedSemesterId);
  }

  let attendanceQuery = db.collection('attendance')
    .where('studentId', '==', studentId);

  let leaveQuery = db.collection('leave_requests')
    .where('studentId', '==', studentId);

  if (selectedSemesterId) {
    attendanceQuery = attendanceQuery.where('semesterId', '==', selectedSemesterId);
    leaveQuery = leaveQuery.where('semesterId', '==', selectedSemesterId);
  }

  const [enrollSnap, attendanceSnap, leaveSnap] = await Promise.all([
    enrollQuery.get(),
    attendanceQuery.get(),
    leaveQuery.get()
  ]);

  const courseMap = {};
  const dateSet = new Set();
  const cellMap = {};

  enrollSnap.docs.forEach(doc => {
    const e = doc.data();
    const key = e.courseGroupCode || `${e.courseCode}-${e.groupCode}`;

    courseMap[key] = {
      courseKey: key,
      courseCode: e.courseCode || '',
      courseName: e.courseName || '',
      groupCode: e.groupCode || '',
      courseGroupCode: e.courseGroupCode || key
    };
  });

  function ensureCell(courseKey, date) {
    const key = `${courseKey}_${date}`;

    if (!cellMap[key]) {
      cellMap[key] = {
        attendance: '',
        leave: '',
        note: '',
        attachmentDataUrl: '',
        attachmentType: ''
      };
    }

    return cellMap[key];
  }

  attendanceSnap.docs.forEach(doc => {
    const d = doc.data();
    const date = d.checkDate || d.attendanceDate || '';
    const courseKey = d.courseGroupCode || `${d.courseCode}-${d.groupCode}`;

    if (!date || !courseKey) return;

    dateSet.add(date);

    if (!courseMap[courseKey]) {
      courseMap[courseKey] = {
        courseKey,
        courseCode: d.courseCode || '',
        courseName: d.courseName || '',
        groupCode: d.groupCode || '',
        courseGroupCode: courseKey
      };
    }

    const cell = ensureCell(courseKey, date);
    cell.attendance = d.attendanceStatus || d.status || 'มาเรียน';
    cell.note = d.note || d.locationStatus || '';
  });

  leaveSnap.docs.forEach(doc => {
    const d = doc.data();
    const date = d.leaveDate || '';
    const courseKey = d.courseGroupCode || `${d.courseCode}-${d.groupCode}`;

    if (!date || !courseKey) return;

    dateSet.add(date);

    if (!courseMap[courseKey]) {
      courseMap[courseKey] = {
        courseKey,
        courseCode: d.courseCode || '',
        courseName: d.courseName || '',
        groupCode: d.groupCode || '',
        courseGroupCode: courseKey
      };
    }

    const cell = ensureCell(courseKey, date);
    cell.leave = d.leaveType || 'ลาเรียน';
    cell.note = d.reason || cell.note || '';
    cell.attachmentDataUrl = d.attachmentDataUrl || '';
    cell.attachmentType = d.attachmentType || '';
  });

  const dates = Array.from(dateSet).sort();

  const tableRows = Object.values(courseMap)
    .sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''))
    .map(course => {
      const cells = dates.map(date => {
        const cell = cellMap[`${course.courseKey}_${date}`] || {};

        let display = '-';

        if (cell.attendance && cell.leave) {
          display = `${cell.attendance} + ${cell.leave}`;
        } else if (cell.attendance) {
          display = cell.attendance;
        } else if (cell.leave) {
          display = cell.leave;
        }

        return {
          date,
          display,
          note: cell.note || '',
          attachmentDataUrl: cell.attachmentDataUrl || '',
          attachmentType: cell.attachmentType || ''
        };
      });

      return {
        ...course,
        cells
      };
    });

  res.render('pages/student/courseRecords', {
    title: 'ตารางเรียนของฉัน',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    selectedSemesterId,
    dates,
    tableRows
  });
});
module.exports = router;