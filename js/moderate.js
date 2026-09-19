/* ==========================================================================
   moderate.js — 管理后台业务核心（黄冈中学校园网）
   职责：账户权限管理（角色调整 / 封禁 / 恢复）、警告、上报处理（处理结果
   可一键公示到「网站违规通报」模块）。纯业务逻辑、不碰 DOM，便于自动化
   测试；admin.js 只负责界面渲染与调用本模块。

   闭环口径（GOAL.md h/i + 任务③④）：
   - 管理类角色上报非法账户（postui「上报账户」）→ reports 表（type=account）
     → 管理员在此处理 → 公示为通报帖（posts/violation）→ 全员可见；
   - 文明检测命中（civility.js 写入 reports）→ 管理员处理时可对当事人警告
     → 警告写入 warnings 表 → 被警告用户下次进站由 Common.nav() 弹全局提醒；
   - 所有管理操作先复核 Perm.can(me.role,'account.manage')，防越权调用。
   ========================================================================== */
var Moderate = (function () {

  var REPORT_TYPE_LABELS = {
    civility: '文明检测命中', post: '帖子上报',
    chat: '闲聊消息上报', account: '账户上报'
  };

  function me_(meId) { return DB.findOne('users', function (u) { return u.id === meId; }); }
  function isAdmin(me) { return !!(me && Perm.can(me.role, 'account.manage')); }

  /* ---------- 账户 ---------- */
  function listUsers() {
    return DB.list('users').slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }
  function stats() {
    var s = { total: 0, banned: 0, byRole: {} };
    var us = DB.list('users');
    for (var i = 0; i < us.length; i++) {
      s.total++;
      if (us[i].status === 'banned') s.banned++;
      s.byRole[us[i].role] = (s.byRole[us[i].role] || 0) + 1;
    }
    return s;
  }

  /* 修改任意账户角色（不能改自己，防止最后一个管理员自锁） */
  function setUserRole(meId, targetId, newRole) {
    var me = me_(meId);
    if (!isAdmin(me)) return { ok: false, msg: '仅管理员可修改账户权限。' };
    if (targetId === meId) return { ok: false, msg: '不能修改自己的角色。' };
    var t = DB.findOne('users', function (u) { return u.id === targetId; });
    if (!t) return { ok: false, msg: '目标账户不存在。' };
    if (Perm.ROLES.indexOf(newRole) < 0) return { ok: false, msg: '角色不合法。' };
    if (t.role === newRole) return { ok: true, msg: '角色未变化。' };
    DB.update('users', targetId, { role: newRole });
    DB.insert('warnings', {
      userId: targetId, type: 'role',
      reason: '管理员已将你的账户角色调整为「' + Common.roleLabel(newRole) + '」，相关权限即时生效。',
      operatorId: meId, read: false
    });
    return { ok: true, msg: '已调整为「' + Common.roleLabel(newRole) + '」。' };
  }

  /* 封禁账户（不能封自己；封禁同时写入警告作站内提醒） */
  function banUser(meId, targetId, reason) {
    var me = me_(meId);
    if (!isAdmin(me)) return { ok: false, msg: '仅管理员可执行封禁。' };
    if (targetId === meId) return { ok: false, msg: '不能封禁自己。' };
    var t = DB.findOne('users', function (u) { return u.id === targetId; });
    if (!t) return { ok: false, msg: '目标账户不存在。' };
    if (t.status === 'banned') return { ok: false, msg: '该账户已是封禁状态。' };
    var r = reason && String(reason).trim() ? String(reason).trim() : '违反校园网文明公约';
    DB.update('users', targetId, { status: 'banned', bannedReason: r, bannedAt: Date.now() });
    DB.insert('warnings', {
      userId: targetId, type: 'ban',
      reason: '你的账户已被管理员封禁：' + r + '。如有疑问请联系管理员。',
      operatorId: meId, read: false
    });
    return { ok: true, msg: '已封禁「' + (t.nickname || t.name) + '」。' };
  }

  /* 恢复（解封） */
  function unbanUser(meId, targetId) {
    var me = me_(meId);
    if (!isAdmin(me)) return { ok: false, msg: '仅管理员可执行恢复。' };
    var t = DB.findOne('users', function (u) { return u.id === targetId; });
    if (!t) return { ok: false, msg: '目标账户不存在。' };
    if (t.status !== 'banned') return { ok: false, msg: '该账户未被封禁。' };
    DB.update('users', targetId, { status: 'active', bannedReason: '', bannedAt: null });
    DB.insert('warnings', {
      userId: targetId, type: 'unban',
      reason: '你的账户已由管理员恢复使用，请遵守校园网文明公约。',
      operatorId: meId, read: false
    });
    return { ok: true, msg: '已恢复「' + (t.nickname || t.name) + '」。' };
  }

  /* ---------- 警告 ---------- */
  function warnUser(meId, targetId, reason, source) {
    var me = me_(meId);
    if (!isAdmin(me)) return { ok: false, msg: '仅管理员可发出警告。' };
    var t = DB.findOne('users', function (u) { return u.id === targetId; });
    if (!t) return { ok: false, msg: '目标账户不存在。' };
    if (!reason || !String(reason).trim()) return { ok: false, msg: '请填写警告原因。' };
    DB.insert('warnings', {
      userId: targetId, type: 'warn', source: source || '',
      reason: String(reason).trim(), operatorId: meId, read: false
    });
    return { ok: true, msg: '已警告「' + (t.nickname || t.name) + '」。' };
  }
  function unreadWarnings(userId) {
    return DB.find('warnings', function (w) { return w.userId === userId && !w.read; });
  }
  function markWarningsRead(userId) {
    var us = DB.find('warnings', function (w) { return w.userId === userId && !w.read; });
    for (var i = 0; i < us.length; i++) DB.update('warnings', us[i].id, { read: true, readAt: Date.now() });
    return us.length;
  }
  function listWarnings() {
    return DB.list('warnings').slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  /* ---------- 上报处理 ----------
     act: 'publish' 公示为通报 | 'warn' 仅警告 | 'ban' 封禁当事人 | 'ignore' 忽略
     处理后 reports.status：published / handled / dismissed（violation 页会显示对应标签）。 */
  function processReport(meId, reportId, act) {
    var me = me_(meId);
    if (!isAdmin(me)) return { ok: false, msg: '仅管理员可处理上报。' };
    var r = DB.findOne('reports', function (x) { return x.id === reportId; });
    if (!r) return { ok: false, msg: '上报记录不存在。' };
    if (r.status !== 'pending') return { ok: false, msg: '该记录已处理过。' };

    /* 当事人定位：账户上报取 targetUserId；其余取内容作者 */
    var targetId = r.targetUserId || r.authorId || null;
    if (!targetId && r.postId) {
      var p = DB.findOne('posts', function (x) { return x.id === r.postId; });
      if (p) targetId = p.authorId;
    }
    var target = targetId ? DB.findOne('users', function (u) { return u.id === targetId; }) : null;
    var tName = target ? (target.nickname || target.name) : (r.targetName || '未知用户');

    var out = { ok: true, warned: false, banned: false, published: false };
    if (act === 'publish') {
      var detail = buildDetail(r, tName);
      DB.insert('posts', {
        module: 'violation',
        authorId: meId,
        title: '通报：' + REPORT_TYPE_LABELS[r.type] + '（' + tName + '）',
        content: detail,
        likes: [], views: 0, shares: 0
      });
      DB.update('reports', reportId, { status: 'published', handledAt: Date.now(), handledBy: meId });
      out.published = true;
      out.msg = '已公示到「网站违规通报」。';
    } else if (act === 'warn') {
      if (!targetId) return { ok: false, msg: '该记录无法定位当事人，建议选择「公示为通报」。' };
      var wr = warnUser(meId, targetId, '经管理员核实，你存在违反校园网文明公约的行为（' + REPORT_TYPE_LABELS[r.type] + '），请自查自纠。', r.type);
      if (!wr.ok) return wr;
      DB.update('reports', reportId, { status: 'handled', handledAt: Date.now(), handledBy: meId });
      out.warned = true;
      out.msg = '已警告当事人。';
    } else if (act === 'ban') {
      if (!targetId) return { ok: false, msg: '该记录无法定位当事人，建议选择「公示为通报」。' };
      var br = banUser(meId, targetId, '经管理员核实存在违规行为（' + REPORT_TYPE_LABELS[r.type] + '）');
      if (!br.ok) return br;
      DB.update('reports', reportId, { status: 'handled', handledAt: Date.now(), handledBy: meId });
      out.banned = true;
      out.msg = '已封禁当事人（含站内提醒）。';
    } else if (act === 'ignore') {
      DB.update('reports', reportId, { status: 'dismissed', handledAt: Date.now(), handledBy: meId });
      out.msg = '已忽略该记录。';
    } else {
      return { ok: false, msg: '未知的处理动作。' };
    }
    return out;
  }

  /* 公示正文：复述违规事实与处理结果（不展示申请码等敏感信息） */
  function buildDetail(r, tName) {
    var lines = [];
    lines.push('【违规类型】' + (REPORT_TYPE_LABELS[r.type] || r.type));
    lines.push('【涉事账户】' + tName);
    if (r.module) lines.push('【发生模块】' + Common.moduleName(r.module));
    if (r.reason) lines.push('【上报理由】' + r.reason);
    if (r.excerpt) lines.push('【内容摘要】' + r.excerpt + '（已打码）');
    lines.push('【处理结果】管理员已核实并按校园网公约处理；请全体同学引以为戒，文明使用校园网。');
    return lines.join('\n');
  }

  function listReports() {
    var pri = { pending: 0, published: 1, handled: 1, dismissed: 2 };
    return DB.list('reports').slice().sort(function (a, b) {
      var d = (pri[a.status] === undefined ? 1 : pri[a.status]) - (pri[b.status] === undefined ? 1 : pri[b.status]);
      if (d !== 0) return d;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  return {
    REPORT_TYPE_LABELS: REPORT_TYPE_LABELS,
    listUsers: listUsers, stats: stats,
    setUserRole: setUserRole, banUser: banUser, unbanUser: unbanUser,
    warnUser: warnUser, unreadWarnings: unreadWarnings,
    markWarningsRead: markWarningsRead, listWarnings: listWarnings,
    processReport: processReport, listReports: listReports
  };
})();
