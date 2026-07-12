const cron = require('node-cron');

const {
  getThaiDateString,
  sendAllDailyAttendanceSummaries
} = require('../services/attendanceSummaryService');

let jobStarted = false;

/**
 * เริ่มระบบส่งสรุปเวลา 20:00 น.
 *
 * ป้องกันการ start cron ซ้ำใน process เดียวกัน
 */
function startAttendanceSummaryJob() {
  if (jobStarted) {
    console.log(
      '[Attendance Summary Job] already started'
    );

    return;
  }

  jobStarted = true;

  /**
   * เวลา 20:00 น. ทุกวัน
   * วินาที นาที ชั่วโมง วัน เดือน วันในสัปดาห์
   */
  cron.schedule(
    '0 0 20 * * *',
    async () => {
      const dateString = getThaiDateString();

      console.log(
        `[Attendance Summary Job] running for ${dateString}`
      );

      try {
        const results =
          await sendAllDailyAttendanceSummaries(
            dateString
          );

        console.log(
          '[Attendance Summary Job] completed:',
          results
        );
      } catch (error) {
        console.error(
          '[Attendance Summary Job] failed:',
          error
        );
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Bangkok'
    }
  );

  console.log(
    '[Attendance Summary Job] scheduled every day at 20:00 Asia/Bangkok'
  );
}

module.exports = {
  startAttendanceSummaryJob
};