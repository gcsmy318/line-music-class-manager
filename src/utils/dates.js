function nowISO(){ return new Date().toISOString(); }
function addMinutes(date, minutes){ return new Date(date.getTime() + minutes * 60000); }
function todayKey(){ return new Date().toISOString().slice(0,10); }
module.exports = { nowISO, addMinutes, todayKey };
