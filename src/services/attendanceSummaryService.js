const { db } = require('../config/firebase');
const { pushText } = require('./lineService');

const SUMMARY_GROUP_COLLECTION = 'line_attendance_summary_groups';
const SUMMARY_RUN_COLLECTION = 'line_attendance_summary_runs';

/**
 * วันที่ตามเวลาไทย YYYY-MM-DD
 */
function getThaiDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * แสดงวันที่ไทย
 */
function formatThaiDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0)
  );

  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * สถานะเข้าเรียนปกติที่ไม่ต้องนำไปรายงาน
 */
function isPresentStatus(status) {
  const normalizedStatus = normalizeText(status);

  const presentStatuses = [
    'มา',
    'มาเรียน',
    'เข้าเรียน',
    'ปกติ',
    'present',
    'checkedin',
    'checkin',
    'เข้าชั้นเรียน'
  ];

  return presentStatuses.includes(normalizedStatus);
}

/**
 * แปลงสถานะให้เป็นข้อความมาตรฐาน
 */
function displayStatus(status) {
  const normalizedStatus = normalizeText(status);

  const statusMap = {
    absent: 'ขาดเรียน',
    ขาด: 'ขาดเรียน',
    ขาดเรียน: 'ขาดเรียน',

    leave: 'ลา',
    ลา: 'ลา',
    ลาป่วย: 'ลาป่วย',
    sickleave: 'ลาป่วย',
    ลากิจ: 'ลากิจ',
    personalleave: 'ลากิจ',

    late: 'มาสาย',
    สาย: 'มาสาย',
    มาสาย: 'มาสาย',

    work: 'ติดงาน',
    ติดงาน: 'ติดงาน',

    activity: 'ติดกิจกรรม',
    ติดกิจกรรม: 'ติดกิจกรรม',

    mission: 'ติดภารกิจ',
    ติดภารกิจ: 'ติดภารกิจ',

    excused: 'มีเหตุจำเป็น',
    อื่นๆ: 'อื่น ๆ'
  };

  return statusMap[normalizedStatus] || status || 'ไม่เข้าเรียน';
}

function getStudentName(student) {
  return (
    student.fullName ||
    student.name ||
    student.studentName ||
    student.displayName ||
    student.studentId ||
    'ไม่ทราบชื่อ'
  );
}

function getStudentYear(student) {
  return String(
    student.year ||
    student.studentYear ||
    student.classYear ||
    student.level ||
    ''
  ).trim();
}

function getRecordStudentId(record) {
  return String(
    record.studentId ||
    record.userId ||
    record.studentDocId ||
    ''
  ).trim();
}

function getCourseCode(record) {
  return (
    record.courseCode ||
    record.subjectCode ||
    record.classCode ||
    'ไม่ระบุรหัสวิชา'
  );
}

function getCourseName(record) {
  return (
    record.courseName ||
    record.subjectName ||
    record.className ||
    ''
  );
}

function getRecordStatus(record) {
  return (
    record.status ||
    record.attendanceStatus ||
    record.checkinStatus ||
    record.leaveType ||
    'ไม่เข้าเรียน'
  );
}

function getReason(record) {
  return (
    record.reason ||
    record.note ||
    record.remark ||
    record.description ||
    ''
  );
}

/**
 * อ่านข้อมูลวันที่จาก Firestore
 *
 * รองรับทั้ง:
 * attendanceDate
 * date
 * checkinDate
 * leaveDate
 */
async function getDocumentsByDate(collectionName, dateString, dateFields) {
  const documents = new Map();

  for (const fieldName of dateFields) {
    try {
      const snapshot = await db
        .collection(collectionName)
        .where(fieldName, '==', dateString)
        .get();

      snapshot.docs.forEach((document) => {
        documents.set(document.id, {
          id: document.id,
          ...document.data()
        });
      });
    } catch (error) {
      console.error(
        `[Attendance Summary] query ${collectionName}.${fieldName} failed:`,
        error.message
      );
    }
  }

  return Array.from(documents.values());
}

/**
 * โหลดนิสิตตามชั้นปี
 */
async function getStudentsByYear(year) {
  const snapshot = await db.collection('students').get();

  return snapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data()
    }))
    .filter((student) => getStudentYear(student) === String(year));
}

/**
 * โหลดรายวิชาเพื่อใช้เติมชื่อรายวิชา
 */
async function getCourseMap() {
  const snapshot = await db.collection('courses').get();
  const courseMap = new Map();

  snapshot.docs.forEach((document) => {
    const course = {
      id: document.id,
      ...document.data()
    };

    if (course.courseCode) {
      courseMap.set(String(course.courseCode), course);
    }

    courseMap.set(document.id, course);
  });

  return courseMap;
}

/**
 * โหลดการตั้งค่ากลุ่มจาก destinationId
 */
async function getSummaryGroupByDestination(destinationId) {
  if (!destinationId) {
    return null;
  }

  const snapshot = await db
    .collection(SUMMARY_GROUP_COLLECTION)
    .where('destinationId', '==', destinationId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

/**
 * บันทึกการตั้งค่ากลุ่ม
 */
async function saveSummaryGroup({
  destinationId,
  sourceType,
  year,
  semester,
  academicYear,
  configuredBy,
  enabled = true
}) {
  const oldConfig = await getSummaryGroupByDestination(destinationId);

  const data = {
    destinationId,
    sourceType: sourceType || 'group',
    studentYear: String(year),
    semester: String(semester),
    academicYear: String(academicYear),
    enabled: Boolean(enabled),
    sendTime: '20:00',
    timezone: 'Asia/Bangkok',
    configuredBy: configuredBy || '',
    updatedAt: new Date().toISOString()
  };

  if (oldConfig) {
    await db
      .collection(SUMMARY_GROUP_COLLECTION)
      .doc(oldConfig.id)
      .set(data, { merge: true });

    return {
      id: oldConfig.id,
      ...oldConfig,
      ...data
    };
  }

  const reference = await db
    .collection(SUMMARY_GROUP_COLLECTION)
    .add({
      ...data,
      createdAt: new Date().toISOString()
    });

  return {
    id: reference.id,
    ...data
  };
}

/**
 * เปิดหรือปิดการส่งอัตโนมัติของกลุ่ม
 */
async function setSummaryGroupEnabled(destinationId, enabled) {
  const config = await getSummaryGroupByDestination(destinationId);

  if (!config) {
    return null;
  }

  await db
    .collection(SUMMARY_GROUP_COLLECTION)
    .doc(config.id)
    .set({
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    }, { merge: true });

  return {
    ...config,
    enabled: Boolean(enabled)
  };
}

/**
 * สร้างสรุปการเข้าเรียน
 */
async function buildAttendanceSummary(config, dateString = getThaiDateString()) {
  const studentYear = String(config.studentYear || '');
  const semester = String(config.semester || '');
  const academicYear = String(config.academicYear || '');

  const [students, attendanceRecords, leaveRecords, courseMap] =
    await Promise.all([
      getStudentsByYear(studentYear),

      getDocumentsByDate(
        'attendance',
        dateString,
        ['attendanceDate', 'date', 'checkinDate']
      ),

      getDocumentsByDate(
        'leave_requests',
        dateString,
        ['leaveDate', 'date']
      ),

      getCourseMap()
    ]);

  const studentMap = new Map();

  students.forEach((student) => {
    studentMap.set(student.id, student);

    if (student.studentId) {
      studentMap.set(String(student.studentId), student);
    }

    if (student.userId) {
      studentMap.set(String(student.userId), student);
    }
  });

  const abnormalRecords = [];
  const recordKeys = new Set();

  /**
   * ข้อมูลจาก attendance
   */
  for (const record of attendanceRecords) {
    const studentId = getRecordStudentId(record);
    const student = studentMap.get(studentId);

    if (!student) {
      continue;
    }

    const status = getRecordStatus(record);

    // คนที่มาเรียนปกติไม่ต้องแจ้ง
    if (isPresentStatus(status)) {
      continue;
    }

    const courseCode = getCourseCode(record);

    const uniqueKey = [
      studentId,
      courseCode,
      normalizeText(status)
    ].join('|');

    if (recordKeys.has(uniqueKey)) {
      continue;
    }

    recordKeys.add(uniqueKey);

    const course =
      courseMap.get(String(record.courseId || '')) ||
      courseMap.get(String(courseCode || ''));

    abnormalRecords.push({
      studentId,
      studentName: getStudentName(student),
      courseCode,
      courseName:
        getCourseName(record) ||
        course?.courseName ||
        course?.name ||
        '',
      status: displayStatus(status),
      reason: getReason(record)
    });
  }

  /**
   * ข้อมูลจากใบลา
   */
  for (const record of leaveRecords) {
    const studentId = getRecordStudentId(record);
    const student = studentMap.get(studentId);

    if (!student) {
      continue;
    }

    const courseCode = getCourseCode(record);
    const leaveStatus =
      record.leaveType ||
      record.status ||
      'ลา';

    const uniqueKey = [
      studentId,
      courseCode,
      normalizeText(leaveStatus)
    ].join('|');

    if (recordKeys.has(uniqueKey)) {
      continue;
    }

    recordKeys.add(uniqueKey);

    const course =
      courseMap.get(String(record.courseId || '')) ||
      courseMap.get(String(courseCode || ''));

    abnormalRecords.push({
      studentId,
      studentName: getStudentName(student),
      courseCode,
      courseName:
        getCourseName(record) ||
        course?.courseName ||
        course?.name ||
        '',
      status: displayStatus(leaveStatus),
      reason: getReason(record)
    });
  }

  abnormalRecords.sort((first, second) => {
    const courseCompare = first.courseCode.localeCompare(
      second.courseCode,
      'th'
    );

    if (courseCompare !== 0) {
      return courseCompare;
    }

    return first.studentName.localeCompare(
      second.studentName,
      'th'
    );
  });

  const header = [
    '📋 สรุปการเข้าเรียนประจำวัน',
    `📅 ${formatThaiDate(dateString)}`,
    `🎓 ชั้นปีที่ ${studentYear}`,
    `📚 ภาคเรียนที่ ${semester}/${academicYear}`,
    ''
  ];

  if (abnormalRecords.length === 0) {
    return [
      ...header,
      '✅ ไม่พบรายการขาด ลา สาย หรือสถานะผิดปกติ',
      '',
      'หมายเหตุ: ระบบไม่แสดงรายชื่อผู้ที่เข้าเรียนปกติ'
    ].join('\n');
  }

  const groupedByCourse = new Map();

  for (const record of abnormalRecords) {
    const courseKey = `${record.courseCode}|${record.courseName}`;

    if (!groupedByCourse.has(courseKey)) {
      groupedByCourse.set(courseKey, []);
    }

    groupedByCourse.get(courseKey).push(record);
  }

  const body = [];

  for (const [, records] of groupedByCourse.entries()) {
    const firstRecord = records[0];

    body.push(
      `📖 ${firstRecord.courseCode}` +
      `${firstRecord.courseName ? ` ${firstRecord.courseName}` : ''}`
    );

    records.forEach((record, index) => {
      const reasonText = record.reason
        ? ` — ${record.reason}`
        : '';

      body.push(
        `${index + 1}. ${record.studentName}` +
        ` (${record.studentId})` +
        `: ${record.status}${reasonText}`
      );
    });

    body.push('');
  }

  body.push(`รวมรายการผิดปกติ ${abnormalRecords.length} รายการ`);
  body.push('');
  body.push('หมายเหตุ: ระบบไม่แสดงรายชื่อผู้ที่เข้าเรียนปกติ');

  return [...header, ...body].join('\n');
}

/**
 * ป้องกันการส่งรายงานซ้ำ
 *
 * ใช้ transaction สร้าง lock:
 * groupConfigId + วันที่
 */
async function acquireDailySummaryLock(configId, dateString) {
  const lockId = `${configId}_${dateString}`;
  const reference = db
    .collection(SUMMARY_RUN_COLLECTION)
    .doc(lockId);

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);

      if (snapshot.exists) {
        throw new Error('SUMMARY_ALREADY_SENT');
      }

      transaction.create(reference, {
        configId,
        summaryDate: dateString,
        status: 'processing',
        createdAt: new Date().toISOString()
      });
    });

    return {
      acquired: true,
      lockId
    };
  } catch (error) {
    if (error.message === 'SUMMARY_ALREADY_SENT') {
      return {
        acquired: false,
        lockId
      };
    }

    throw error;
  }
}

async function markSummaryLockSuccess(lockId) {
  await db
    .collection(SUMMARY_RUN_COLLECTION)
    .doc(lockId)
    .set({
      status: 'sent',
      sentAt: new Date().toISOString()
    }, { merge: true });
}

async function markSummaryLockFailed(lockId, error) {
  await db
    .collection(SUMMARY_RUN_COLLECTION)
    .doc(lockId)
    .set({
      status: 'failed',
      error: error?.message || String(error),
      failedAt: new Date().toISOString()
    }, { merge: true });
}

/**
 * ส่งรายงานอัตโนมัติทุกกลุ่ม
 */
async function sendAllDailyAttendanceSummaries(
  dateString = getThaiDateString()
) {
  const snapshot = await db
    .collection(SUMMARY_GROUP_COLLECTION)
    .where('enabled', '==', true)
    .get();

  const results = [];

  for (const document of snapshot.docs) {
    const config = {
      id: document.id,
      ...document.data()
    };

    if (!config.destinationId) {
      results.push({
        configId: config.id,
        status: 'skipped',
        reason: 'destinationId ไม่ถูกตั้งค่า'
      });

      continue;
    }

    let lock;

    try {
      lock = await acquireDailySummaryLock(
        config.id,
        dateString
      );

      if (!lock.acquired) {
        results.push({
          configId: config.id,
          destinationId: config.destinationId,
          status: 'skipped',
          reason: 'รายงานวันนี้ถูกส่งแล้ว'
        });

        continue;
      }

      const summary = await buildAttendanceSummary(
        config,
        dateString
      );

      await pushText(config.destinationId, summary);
      await markSummaryLockSuccess(lock.lockId);

      results.push({
        configId: config.id,
        destinationId: config.destinationId,
        status: 'sent'
      });
    } catch (error) {
      console.error(
        '[Attendance Summary] send failed:',
        config.id,
        error
      );

      if (lock?.lockId) {
        await markSummaryLockFailed(
          lock.lockId,
          error
        );
      }

      results.push({
        configId: config.id,
        destinationId: config.destinationId,
        status: 'failed',
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  getThaiDateString,
  formatThaiDate,
  getSummaryGroupByDestination,
  saveSummaryGroup,
  setSummaryGroupEnabled,
  buildAttendanceSummary,
  sendAllDailyAttendanceSummaries
};