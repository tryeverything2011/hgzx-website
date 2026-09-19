/* ==========================================================================
   permission.js — 权限矩阵 + 申请码校验（黄冈中学校园网）
   页面一律调用 Perm.can(role, action) 判断权限，与 design/plan.md 第3节一致。
   申请码定稿值仅存于本文件校验逻辑中；页面与文案禁止展示明文。
   ========================================================================== */
var Perm = (function () {
  /* 申请码（由用户线下分发，此处仅用于输入比对，不回显、不记录） */
  var CODES = {
    admin: 'madebyczh',
    union: 'hgzxstu'
  };

  var ROLES = ['student', 'teacher', 'leader', 'union', 'admin'];

  /* 权限矩阵：action -> 允许的角色（1=允许；未列出的角色一律默认拒绝） */
  var MATRIX = {
    viewAll:             { teacher: 1, leader: 1, union: 1, admin: 1 },  // 浏览全部内容（学生仅可见公开及对其开放的部分）
    chat:                { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 闲聊发言/点赞/评论
    'wall.post':         { student: 1, admin: 1 },                       // 表白墙发帖
    'say.toTeacher':     { student: 1 },                                 // 我有话对你说：学生匿名留言给老师
    'say.toStudent':     { teacher: 1 },                                 // 我有话对你说：老师定向留言给学生
    'rant.post':         { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 我想吐槽发帖
    'event.topic':       { union: 1, admin: 1 },                         // 校园大事件：发话题
    'event.reply':       { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 校园大事件：跟帖
    'life.post':         { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 生活分享发帖
    'qa.ask':            { student: 1 },                                 // 你问我答：提问
    'qa.answer':         { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 你问我答：回答
    'notice.publish':    { leader: 1, union: 1 },                        // 重要通知下发
    'violation.publish': { union: 1, admin: 1 },                         // 违规通报公示
    'material.upload':   { teacher: 1, leader: 1, union: 1, admin: 1 },  // 学习资料上传
    'post.report':       { student: 1, teacher: 1, leader: 1, union: 1, admin: 1 }, // 帖子一键上报学生会/管理员
    'post.pin':          { teacher: 1, leader: 1, union: 1, admin: 1 },  // 置顶帖子
    'post.delete':       { teacher: 1, leader: 1, union: 1, admin: 1 },  // 删除帖子
    'account.report':    { teacher: 1, leader: 1, union: 1, admin: 1 },  // 上报非法账户
    'account.manage':    { admin: 1 }                                    // 账户管理/修改权限
  };

  function can(role, action) {
    var m = MATRIX[action];
    return !!(m && m[role]);
  }

  /* 申请码校验：仅做字符串比对 */
  function verifyCode(role, code) {
    var expect = CODES[role];
    if (!expect) return false;
    return String(code == null ? '' : code).trim() === expect;
  }

  return { can: can, verifyCode: verifyCode, ROLES: ROLES };
})();
