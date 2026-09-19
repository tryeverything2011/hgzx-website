/* ==========================================================================
   common.js — 公共层：模块元数据 / 顶部导航 / 页脚 / 工具函数（黄冈中学校园网）
   各页面加载顺序：storage.js → permission.js → civility.js → auth.js
   → seed.js → common.js → 页面脚本
   ========================================================================== */
var Common = (function () {

  /* ---- 10 大功能模块元数据（首页入口卡片与占位页共用） ---- */
  var MODULES = [
    { key: 'chat',      name: '闲聊吧',       icon: '💬', desc: '丘班 / 高一 / 高二 / 高三 / 总群分区畅聊，内容所有人可见', href: 'pages/chat.html' },
    { key: 'wall',      name: '表白墙',       icon: '💝', desc: '仅学生与管理员可发帖，支持评论、点赞与分享', href: 'pages/wall.html' },
    { key: 'say',       name: '我有话对你说', icon: '✉️', desc: '学生匿名留言给老师，老师定向回复学生', href: 'pages/say.html' },
    { key: 'rant',      name: '我想吐槽',     icon: '🗣️', desc: '反映校园问题，分类归档并推送给对应需知人群', href: 'pages/rant.html' },
    { key: 'event',     name: '校园大事件',   icon: '📣', desc: '管理员与学生会发布话题，全员可跟帖交流', href: 'pages/event.html' },
    { key: 'life',      name: '生活分享',     icon: '🌈', desc: '分享生活点滴，发布者自主设置可见权限', href: 'pages/life.html' },
    { key: 'qa',        name: '你问我答',     icon: '❓', desc: '提问与答疑，非学生账户回复置顶，按年级学科分类', href: 'pages/qa.html' },
    { key: 'notice',    name: '重要通知',     icon: '📢', desc: '领导与学生会下发通知，所有人可见并提醒', href: 'pages/notice.html' },
    { key: 'violation', name: '网站违规通报', icon: '⚠️', desc: '公示违规行为与处理结果', href: 'pages/violation.html' },
    { key: 'material',  name: '学习资料上传', icon: '📚', desc: '按年级、学科分类，所有人可见、可下载', href: 'pages/material.html' }
  ];

  var ROLE_LABELS = { student: '学生', teacher: '老师', leader: '领导', union: '学生会', admin: '管理员' };
  var ROLE_COLORS = { student: '#1460a8', teacher: '#2e9e6b', leader: '#7a5aa8', union: '#f6a623', admin: '#d64545' };

  /* ---- 工具函数 ---- */

  /* HTML 转义（所有用户内容插入 DOM 前必须经过本函数） */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 读取 URL 查询参数 */
  function q(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* 时间戳 → "YYYY-MM-DD HH:mm" */
  function fmtTime(ts) {
    var d = new Date(ts || Date.now());
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 截断摘要 */
  function snippet(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function getModule(key) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].key === key) return MODULES[i];
    return null;
  }
  function moduleName(key) { var m = getModule(key); return m ? m.name : '功能模块'; }
  function roleLabel(role) { return ROLE_LABELS[role] || '访客'; }

  /* 子页面路径前缀（pages/ 下的页面回跳根目录用） */
  function rootPrefix() {
    return /\/pages\//.test(location.pathname) ? '../' : '';
  }

  /* 头像组件：有头像用图，否则「昵称首字 + 角色色」圆形字母头像 */
  function avatarHtml(u) {
    if (!u) return '<span class="avatar" style="background:#8aa0b5">客</span>';
    if (u.avatar) return '<img class="avatar" src="' + u.avatar + '" alt="">';
    var ch = String(u.nickname || u.name || '客').trim().charAt(0);
    var c = ROLE_COLORS[u.role] || '#1460a8';
    return '<span class="avatar" style="background:' + c + '">' + esc(ch) + '</span>';
  }

  /* ---- 顶部导航（含登录态、角色徽章、退出登录） ----
     附加职责：封禁联动（被封禁账户强制下线）、管理员入口、
     警告提醒条（被警告用户站内提醒，管理后台闭环）。 */
  function nav() {
    var el = document.getElementById('siteNav');
    if (!el) return;
    var root = rootPrefix();
    var u = (typeof Auth !== 'undefined') ? Auth.currentUser() : null;

    /* 封禁联动：已登录但账户已被管理员封禁 → 立即登出并全局提示 */
    var forcedBanMsg = '';
    if (u && u.status === 'banned') {
      forcedBanMsg = '你的账户已被封禁' + (u.bannedReason ? '：' + u.bannedReason : '') + '。如有疑问请联系管理员。';
      Auth.logout();
      u = null;
    }

    var right;
    if (u) {
      var unread = unreadCount();
      var bell = '<a class="nav-bell" href="' + root + 'pages/notice.html" title="重要通知">🔔' +
        (unread > 0 ? '<span class="bell-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
        '</a>';
      var adminLink = (u.role === 'admin')
        ? '<a class="nav-admin" href="' + root + 'admin.html" title="管理后台 · 权限中心">🛠 后台</a>'
        : '';
      right =
        bell +
        adminLink +
        '<div class="nav-user">' + avatarHtml(u) +
          '<span>' + esc(u.nickname || u.name) + '</span>' +
          '<span class="role-badge">' + esc(roleLabel(u.role)) + '</span>' +
          '<button type="button" class="btn-logout" id="btnLogout">退出登录</button>' +
        '</div>';
    } else {
      right = '<a href="' + root + 'login.html">登录</a><a href="' + root + 'register.html">注册</a>';
    }
    el.innerHTML =
      '<div class="wrap nav-inner">' +
        '<a class="brand" href="' + root + 'index.html">🏛️ 黄冈中学校园网</a>' +
        '<div class="nav-right">' + right + '</div>' +
      '</div>';
    var btn = document.getElementById('btnLogout');
    if (btn) btn.onclick = function () { Auth.logout(); location.href = root + 'index.html'; };

    /* 警告提醒条：未读警告（含封禁/角色调整通知）展示在导航下方，点「我知道了」关闭 */
    globalBanners(forcedBanMsg ? [forcedBanMsg] : null);
  }

  /* ---- 全局提醒条：未读警告列表（黄冈中学校园网） ---- */
  function globalBanners(extraMsgs) {
    var old = document.getElementById('hgzxBanners');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var msgs = (extraMsgs || []).slice(0);
    var me = (typeof Auth !== 'undefined') ? Auth.currentUser() : null;
    if (me && typeof DB !== 'undefined') {
      DB.find('warnings', function (w) { return w.userId === me.id && !w.read; })
        .forEach(function (w) { msgs.push(w.reason || '你有一条来自管理员的通知。'); });
    }
    if (!msgs.length) return;
    var div = document.createElement('div');
    div.id = 'hgzxBanners';
    div.className = 'global-banner';
    div.innerHTML = msgs.slice(0, 5).map(function (m) {
      return '<div class="gb-item"><span>⚠️ ' + esc(m) + '</span></div>';
    }).join('') +
    '<div class="gb-item gb-act"><button type="button" class="gb-close" id="gbClose">我知道了</button></div>';
    document.body.insertBefore(div, document.body.firstChild);
    var c = document.getElementById('gbClose');
    if (c) c.onclick = function () {
      if (me) {
        DB.find('warnings', function (w) { return w.userId === me.id && !w.read; })
          .forEach(function (w) { DB.update('warnings', w.id, { read: true, readAt: Date.now() }); });
      }
      if (div.parentNode) div.parentNode.removeChild(div);
    };
  }

  /* ---- 页脚 ---- */
  function footer() {
    var el = document.getElementById('siteFooter');
    if (!el) return;
    var mode = '演示数据存本地浏览器（本地回退模式）；按《建站部署指南》配置云数据库后数据全校互通。';
    if (typeof DB !== 'undefined' && DB.backend && DB.backend() !== 'local') {
      mode = '云端模式：数据全校互通、所有人可见。';
    }
    el.innerHTML =
      '<div class="f-brand">黄冈中学校园网（演示版）</div>' +
      '<div>页面内容均为示例占位，正式信息以学校发布为准。</div>' +
      '<div class="f-mode">' + esc(mode) + '</div>';
  }

  /* ---- 热门评选：热度 = 点赞×3 + 评论×2 + 看过÷10 ---- */
  function hotScore(p) {
    var cmts = DB.find('comments', function (c) { return c.postId === p.id; }).length;
    var likes = (p.likes && p.likes.length) || 0;
    return likes * 3 + cmts * 2 + (p.views || 0) / 10;
  }

  /* 热门榜：按热度倒序取前 n 条；「我有话对你说」为私密定向内容，不参评 */
  function hotTop(n) {
    var posts = DB.find('posts', function (p) { return p.module !== 'say'; });
    posts.sort(function (a, b) { return hotScore(b) - hotScore(a); });
    return posts.slice(0, n || 5);
  }

  /* ---- 注册查重：姓名 / 昵称 / 学号 / QQ号（v1.5：昵称为登录凭证，全站唯一），返回重复字段中文名数组 ---- */
  function checkDup(users, f) {
    var dup = [];
    var name = String(f.name || '').trim();
    var nick = String(f.nickname || '').trim();
    var qq = String(f.qq || '').trim();
    var sno = String(f.studentNo || '').trim();
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (name && String(u.name || '').trim() === name && dup.indexOf('姓名') < 0) dup.push('姓名');
      if (nick && String(u.nickname || '').trim() === nick && dup.indexOf('昵称') < 0) dup.push('昵称');
      if (qq && String(u.qq || '').trim() === qq && dup.indexOf('QQ号') < 0) dup.push('QQ号');
      if (sno && String(u.studentNo || '').trim() === sno && dup.indexOf('学号') < 0) dup.push('学号');
    }
    return dup;
  }

  /* ---- 图片压缩：canvas 等比缩放，输出 JPEG dataURL，单图上限约 300KB ----
     （云端配额口径：单图 ≤300KB；编码后 dataURL 超限时逐轮降低质量/尺寸重试） */
  function compressImage(file, maxPx, cb) {
    if (!file) { cb(''); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX_LEN = 400000;   // dataURL 字符数上限（约对应 300KB 二进制）
        var scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        var quality = 0.85;
        var dataURL = '';
        for (var round = 0; round < 6; round++) {
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          try { dataURL = cv.toDataURL('image/jpeg', quality); } catch (e) { cb(''); return; }
          if (dataURL.length <= MAX_LEN) break;
          quality = quality > 0.55 ? 0.55 : quality * 0.7;
          scale *= 0.75;
        }
        cb(dataURL);
      };
      img.onerror = function () { cb(''); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(''); };
    fr.readAsDataURL(file);
  }

  /* ---- 学生年级识别：依据班级名（丘班 / 高一 / 高二 / 高三），未知返回空串 ---- */
  function gradeOf(u) {
    if (!u || !u.className) return '';
    var cn = String(u.className);
    if (cn.indexOf('丘') >= 0) return '丘班';
    if (cn.indexOf('高一') >= 0) return '高一';
    if (cn.indexOf('高二') >= 0) return '高二';
    if (cn.indexOf('高三') >= 0) return '高三';
    return '';
  }

  /* ---- 重要通知未读提醒：noticeRead 表记录每个用户已读的通知 id ---- */
  function readMap() { return DB.get('noticeRead', {}); }

  function unreadCount() {
    var u = (typeof Auth !== 'undefined') ? Auth.currentUser() : null;
    if (!u) return 0;
    var read = readMap()[u.id] || {};
    return DB.find('posts', function (p) {
      return p.module === 'notice' && !read[p.id];
    }).length;
  }

  function markNoticesRead() {
    var u = (typeof Auth !== 'undefined') ? Auth.currentUser() : null;
    if (!u) return;
    var map = readMap();
    var mine = map[u.id] || {};
    DB.find('posts', function (p) { return p.module === 'notice'; })
      .forEach(function (p) { mine[p.id] = Date.now(); });
    map[u.id] = mine;
    DB.set('noticeRead', map);
  }

  return {
    MODULES: MODULES, ROLE_LABELS: ROLE_LABELS, ROLE_COLORS: ROLE_COLORS,
    esc: esc, q: q, fmtTime: fmtTime, snippet: snippet,
    getModule: getModule, moduleName: moduleName, roleLabel: roleLabel,
    avatarHtml: avatarHtml, nav: nav, footer: footer,
    hotScore: hotScore, hotTop: hotTop, checkDup: checkDup,
    compressImage: compressImage, gradeOf: gradeOf,
    unreadCount: unreadCount, markNoticesRead: markNoticesRead
  };
})();
