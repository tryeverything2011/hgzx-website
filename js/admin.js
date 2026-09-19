/* ==========================================================================
   admin.js — 管理后台界面（黄冈中学校园网）
   仅管理员可用：入口在顶部导航（Common.nav 按角色显示），直达 URL 也会被
   此处拦截。三个面板：账户权限 / 上报处理 / 警告记录；顶部常驻存储模式卡
   （本地回退模式注明「演示数据存本地浏览器」，云端模式显示同步状态）。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();

  var me = Auth.currentUser();
  if (!Perm.can(me.role, 'account.manage')) {
    document.getElementById('denyPanel').hidden = false;
    return;
  }

  var tabsEl = document.getElementById('adminTabs');
  var panels = { acc: 'panelAcc', rep: 'panelRep', warn: 'panelWarn' };
  var tab = 'acc';
  var TABS = [
    { k: 'acc', name: '👤 账户权限' },
    { k: 'rep', name: '📮 上报处理' },
    { k: 'warn', name: '⚠️ 警告记录' }
  ];

  function drawTabs() {
    var pendingN = DB.find('reports', function (r) { return r.status === 'pending'; }).length;
    var warnN = DB.find('warnings', function (w) { return !w.read; }).length;
    tabsEl.innerHTML = TABS.map(function (t) {
      var badge = '';
      if (t.k === 'rep' && pendingN) badge = ' <span class="bell-badge">' + pendingN + '</span>';
      if (t.k === 'warn' && warnN) badge = ' <span class="bell-badge">' + warnN + '</span>';
      return '<button type="button" class="fbtn' + (tab === t.k ? ' on' : '') + '" data-tab="' + t.k + '">' + t.name + badge + '</button>';
    }).join('');
  }
  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (!b) return;
    tab = b.getAttribute('data-tab');
    drawTabs(); render();
  });

  /* ---------- 存储模式 / 云端状态卡 ---------- */
  function fmtT(ts) { return ts ? Common.fmtTime(ts) : '—'; }
  function renderCloud() {
    var el = document.getElementById('cloudStatus');
    var st = DB.status();
    if (st.mode === 'local') {
      el.className = 'card cloud-card warn';
      el.innerHTML = '<b>💾 本地回退模式</b>：未配置云数据库，演示数据仅存于当前浏览器，' +
        '其他设备不可见。接入方法见《建站部署指南》「云数据库开通与配置」章节：' +
        '注册 LeanCloud → 建应用 → 把密钥填入 <code>config.js</code> → 刷新即全校互通。' +
        (st.error ? '<br>⚠️ ' + Common.esc(st.error) : '');
      return;
    }
    var ok = st.ready && !st.error;
    el.className = 'card cloud-card ' + (ok ? 'ok' : 'err');
    var line = '<b>☁️ 云端模式（' + (st.mode === 'leancloud' ? 'LeanCloud' : 'Supabase') + '）</b>：' +
      (ok ? '数据全校互通、所有人可见。' : '云端暂不可用（已自动回退本地读写，恢复后自动续传）。');
    line += '<br><span class="mask">上次拉取：' + fmtT(st.lastPullAt) + ' · 上次推送：' + fmtT(st.lastPushAt) +
      ' · 待推送：' + st.pendingWrites + ' 条' + (st.skippedBig ? ' · 超大未上云：' + st.skippedBig + ' 条' : '') + '</span>';
    if (st.error) line += '<br>⚠️ ' + Common.esc(st.error);
    el.innerHTML = line;
  }

  /* ---------- 面板①：账户权限 ---------- */
  var searchEl = document.getElementById('userSearch');
  searchEl.addEventListener('input', function () { renderUsers(); });

  function staffInfo(u) {
    if (u.role === 'teacher') return '学科部门：' + Common.esc(u.subjectDept || '—') + ' · 办公学科：' + Common.esc(u.officeSubject || '—');
    if (u.role === 'leader') return '分管年级：' + Common.esc(u.managedGrade || '—') + ' · 部门：' + Common.esc(u.dept || '—');
    if (u.role === 'union') return '班级：' + Common.esc(u.className || '—');
    return '—';
  }
  function renderStats() {
    var s = Moderate.stats();
    var chips = ['共 ' + s.total + ' 个账户', '封禁 ' + s.banned];
    for (var i = 0; i < Perm.ROLES.length; i++) {
      var r = Perm.ROLES[i];
      chips.push(Common.roleLabel(r) + ' ' + (s.byRole[r] || 0));
    }
    document.getElementById('statChips').innerHTML =
      chips.map(function (c) { return '<span class="stat-chip">' + Common.esc(c) + '</span>'; }).join('');
  }
  function renderUsers() {
    renderStats();
    var kw = searchEl.value.trim().toLowerCase();
    var rows = Moderate.listUsers().filter(function (u) {
      if (!kw) return true;
      var hay = [u.name, u.nickname, u.qq, u.studentNo, u.className, u.cohort,
                 u.subjectDept, u.officeSubject, u.managedGrade, u.dept].join(' ').toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    var tb = document.getElementById('userRows');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-sub)">没有匹配的账户。</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (u) {
      var banned = u.status === 'banned';
      var self = u.id === me.id;
      var roleSel = '<select class="role-sel" data-sel="' + u.id + '"' + (self ? ' disabled title="不能修改自己"' : '') + '>' +
        Perm.ROLES.map(function (r) {
          return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + Common.roleLabel(r) + '</option>';
        }).join('') + '</select>';
      var ops =
        (self ? '' : '<button type="button" class="pact pact-ok" data-act="apply-role" data-uid="' + u.id + '">应用角色</button>') +
        (banned
          ? '<button type="button" class="pact pact-ok" data-act="unban" data-uid="' + u.id + '">恢复</button>'
          : (self ? '' : '<button type="button" class="pact pact-danger" data-act="ban" data-uid="' + u.id + '">封禁</button>'));
      return '<tr' + (banned ? ' style="opacity:.6"' : '') + '>' +
        '<td><div class="u-cell">' + Common.avatarHtml(u) +
          '<div><b>' + Common.esc(u.name) + '</b>' + (u.nickname && u.nickname !== u.name ? '<br><small>' + Common.esc(u.nickname) + '</small>' : '') + '</div></div></td>' +
        '<td>' + roleSel + '</td>' +
        '<td>' + Common.esc(u.gender || '—') + '</td>' +
        '<td>' + Common.esc(u.qq || '—') + '</td>' +
        '<td>' + Common.esc(u.studentNo || '—') + '</td>' +
        '<td>' + Common.esc((u.className || '—') + (u.cohort ? ' / ' + u.cohort : '')) + '</td>' +
        '<td><small>' + staffInfo(u) + '</small></td>' +
        '<td><span title="昵称为全站唯一登录凭证">' + Common.esc(u.nickname || '—') + '</span></td>' +
        '<td><span class="st-chip ' + (banned ? 'st-banned' : 'st-active') + '">' + (banned ? '已封禁' : '正常') + '</span></td>' +
        '<td><div class="p-actions">' + ops + '</div></td>' +
      '</tr>';
    }).join('');
  }

  /* ---------- 面板②：上报处理 ---------- */
  function renderReports() {
    var el = document.getElementById('repList');
    var rows = Moderate.listReports();
    if (!rows.length) { el.innerHTML = '<div class="card empty-card">暂无上报记录。</div>'; return; }
    el.innerHTML = rows.map(function (r) {
      var target = null;
      var tid = r.targetUserId || r.authorId;
      if (tid) target = DB.findOne('users', function (u) { return u.id === tid; });
      var tName = target ? (target.nickname || target.name) : (r.targetName || '未定位到当事人');
      var reporter = r.reporterId ? DB.findOne('users', function (u) { return u.id === r.reporterId; }) : null;
      var stLabel = { pending: '<span class="st-chip st-banned">待处理</span>',
                      published: '<span class="st-chip st-active">已公示</span>',
                      handled: '<span class="st-chip st-active">已处理</span>',
                      dismissed: '<span class="st-chip">已忽略</span>' }[r.status] || Common.esc(r.status);
      var ops = '';
      if (r.status === 'pending') {
        ops =
          '<button type="button" class="pact pact-ok" data-act="rp-publish" data-rid="' + r.id + '">📋 公示为通报</button>' +
          '<button type="button" class="pact" data-act="rp-warn" data-rid="' + r.id + '">⚠️ 警告当事人</button>' +
          '<button type="button" class="pact pact-danger" data-act="rp-ban" data-rid="' + r.id + '">🚫 封禁当事人</button>' +
          '<button type="button" class="pact" data-act="rp-ignore" data-rid="' + r.id + '">忽略</button>';
      }
      return '<article class="card post rep-card">' +
        '<div class="p-head"><span class="module-chip">' + Common.esc(Moderate.REPORT_TYPE_LABELS[r.type] || r.type) + '</span>' +
          '<span class="p-time">' + Common.esc(r.module ? Common.moduleName(r.module) : '账户监管') + ' · ' + Common.fmtTime(r.createdAt) + ' · ' + stLabel + '</span></div>' +
        '<div class="p-content">' +
          (r.reason ? '<p><b>理由：</b>' + Common.esc(r.reason) + '</p>' : '') +
          (r.excerpt ? '<p><b>摘要：</b><span class="mask">' + Common.esc(r.excerpt) + '</span></p>' : '') +
          '<p><b>当事人：</b>' + Common.esc(tName) + (reporter ? ' · <b>上报人：</b>' + Common.esc(reporter.nickname || reporter.name) : '') + '</p>' +
        '</div>' +
        (ops ? '<div class="p-actions">' + ops + '</div>' : '') +
      '</article>';
    }).join('');
  }

  /* ---------- 面板③：警告记录 ---------- */
  function renderWarns() {
    var el = document.getElementById('warnList');
    var rows = Moderate.listWarnings();
    if (!rows.length) { el.innerHTML = '<div class="card empty-card">暂无警告记录。</div>'; return; }
    el.innerHTML = rows.map(function (w) {
      var u = DB.findOne('users', function (x) { return x.id === w.userId; });
      var op = w.operatorId ? DB.findOne('users', function (x) { return x.id === w.operatorId; }) : null;
      var typeLabel = { warn: '警告', ban: '封禁通知', unban: '恢复通知', role: '角色调整' }[w.type] || w.type;
      return '<article class="card post rep-card' + (w.read ? '' : ' rep-unread') + '">' +
        '<div class="p-head"><span class="module-chip">' + Common.esc(typeLabel) + '</span>' +
          '<span class="p-time">' + Common.fmtTime(w.createdAt) + ' · ' + (w.read ? '对方已读' : '<b>未读</b>') + '</span></div>' +
        '<div class="p-content"><p><b>对象：</b>' + Common.esc(u ? (u.nickname || u.name) : '（已注销）') + '</p>' +
          '<p>' + Common.esc(w.reason) + '</p>' +
          (op ? '<p class="mask">操作人：' + Common.esc(op.nickname || op.name) + '</p>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------- 交互（事件委托） ---------- */
  document.body.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    var act = b.getAttribute('data-act'), uid = b.getAttribute('data-uid'), rid = b.getAttribute('data-rid');

    if (act === 'apply-role') {
      var sel = document.querySelector('[data-sel="' + uid + '"]');
      var nr = sel ? sel.value : null;
      var r1 = Moderate.setUserRole(me.id, uid, nr);
      toast(r1.msg || (r1.ok ? '已应用。' : '操作失败。'));
    } else if (act === 'ban') {
      var reason = prompt('封禁原因（将显示给对方）：', '违反校园网文明公约');
      if (reason === null) return;
      var r2 = Moderate.banUser(me.id, uid, reason);
      toast(r2.msg || '操作失败。');
    } else if (act === 'unban') {
      var r3 = Moderate.unbanUser(me.id, uid);
      toast(r3.msg || '操作失败。');
    } else if (act === 'rp-publish') {
      var r4 = Moderate.processReport(me.id, rid, 'publish');
      toast(r4.msg || '操作失败。');
    } else if (act === 'rp-warn') {
      var r5 = Moderate.processReport(me.id, rid, 'warn');
      toast(r5.msg || '操作失败。');
    } else if (act === 'rp-ban') {
      if (!confirm('确认封禁该当事人？封禁后其将无法登录。')) return;
      var r6 = Moderate.processReport(me.id, rid, 'ban');
      toast(r6.msg || '操作失败。');
    } else if (act === 'rp-ignore') {
      var r7 = Moderate.processReport(me.id, rid, 'ignore');
      toast(r7.msg || '操作失败。');
    }
    drawTabs(); render();
  });

  /* 轻提示（2.5s 自动消失，替代多个 alert） */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('admToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'admToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:#22303e;color:#fff;' +
        'padding:10px 18px;border-radius:10px;font-size:13.5px;z-index:99;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2500);
  }

  function render() {
    document.getElementById('panelAcc').hidden = tab !== 'acc';
    document.getElementById('panelRep').hidden = tab !== 'rep';
    document.getElementById('panelWarn').hidden = tab !== 'warn';
    if (tab === 'acc') renderUsers();
    else if (tab === 'rep') renderReports();
    else renderWarns();
  }

  document.title = '管理后台 · 权限中心 — 黄冈中学校园网';
  drawTabs();
  renderCloud();
  render();
  setInterval(renderCloud, 5000);   // 云端状态定时刷新
})();
