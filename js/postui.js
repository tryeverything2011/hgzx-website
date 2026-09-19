/* ==========================================================================
   postui.js — 帖子通用渲染与交互层（黄冈中学校园网）
   供 wall / rant / event / life / qa / notice / violation / material 各模块页
   复用：帖子卡片（点赞 / 评论 / 分享 / 看过 / 上报 / 置顶 / 删除 / 下载）、
   评论列表与评论框、排序（最新 / 最热）、可见范围判定等。
   纯逻辑函数（canSeeLife / sortPosts / sortComments）不依赖 DOM，便于测试。
   依赖加载顺序：storage → permission → civility → auth → seed → common → 本文件。
   ========================================================================== */
var PostUI = (function () {

  /* ---------- 纯逻辑：生活分享可见范围 ----------
     教职工（老师/领导/学生会/管理员）可见全部内容（GOAL 权限口径）；
     学生可见：公开帖、本人帖子、对其年级/角色开放的帖子。「仅自己」除本人外
     均不可见（管理员监管口径下可见全部，与 GOAL h 一致）。 */
  function canSeeLife(p, u) {
    if (!u || !p) return false;
    if (Perm.can(u.role, 'viewAll')) return true;
    if (p.authorId === u.id) return true;
    var mode = p.visMode || 'public';
    if (mode === 'public') return true;
    if (mode === 'grade') { var g = Common.gradeOf(u); return !!g && g === p.visGrade; }
    if (mode === 'role') return u.role === p.visRole;
    return false;
  }

  /* 生活分享可见范围标签 */
  function visLabel(p) {
    var mode = p.visMode || 'public';
    if (mode === 'grade') return '仅' + p.visGrade + '可见';
    if (mode === 'role') return '仅' + Common.roleLabel(p.visRole) + '可见';
    if (mode === 'self') return '仅自己可见';
    return '所有人可见';
  }

  /* ---------- 排序：置顶优先；其余按 热度 / 时间 ---------- */
  function sortPosts(arr, mode) {
    return arr.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (mode === 'hot') return Common.hotScore(b) - Common.hotScore(a);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /* ---------- 评论排序：qa 模块非学生账户回复自动置顶，其余按时间正序 ---------- */
  function isStaffComment(c) {
    var u = DB.findOne('users', function (x) { return x.id === c.authorId; });
    return !!(u && Perm.can(u.role, 'viewAll'));
  }
  function sortComments(arr, pinStaff) {
    return arr.slice().sort(function (a, b) {
      if (pinStaff) {
        var pa = isStaffComment(a), pb = isStaffComment(b);
        if (pa !== pb) return pa ? -1 : 1;
      }
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /* ---------- 看过人数：每个浏览器对每帖仅计数一次 ----------
     返回新计数值；调用方可同步刷新内存中的行对象，避免首次渲染仍显示旧值 */
  function incView(pid) {
    var seen = DB.get('viewed', {});
    if (seen[pid]) return null;
    seen[pid] = 1;
    DB.set('viewed', seen);
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    var nv = ((p && p.views) || 0) + 1;
    if (p) DB.update('posts', pid, { views: nv });
    return nv;
  }

  /* ---------- 复制到剪贴板（含降级方案） ---------- */
  function copyText(text, cb) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      cb(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
    } else fallback();
  }

  /* ---------- 分享：复制「文案 + 链接」到剪贴板，分享数 +1 ---------- */
  function doShare(pid, done) {
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    if (!p) return;
    var link = location.href.split('?')[0] + '?pid=' + encodeURIComponent(pid);
    var text = '【' + Common.moduleName(p.module) + '】' +
      (p.title ? p.title + '：' : '') + Common.snippet(p.content, 60) +
      ' —— 来自黄冈中学校园网，快来看看吧！';
    copyText(text + '\n' + link, function (ok) {
      DB.update('posts', pid, { shares: (p.shares || 0) + 1 });
      alert(ok ? '分享文案与链接已复制，可粘贴发送给QQ好友或同学。'
               : '复制失败，请手动复制地址栏链接进行分享。');
      if (done) done();
    });
  }

  /* ---------- 一键上报学生会与管理员（内容先过文明检测） ---------- */
  function doReport(pid, kind) {
    var me = Auth.currentUser();
    if (!me || !Perm.can(me.role, 'post.report')) { alert('请先登录后再上报。'); return; }
    var reason = prompt('请填写上报理由（将提交给学生会与管理员处理）：');
    if (reason === null) return;
    if (!reason.trim()) reason = '未填写理由';
    var g = Civility.guard(reason, { module: 'report', authorId: me.id });
    if (!g.ok) { alert(g.msg); return; }
    DB.insert('reports', {
      type: kind === 'chat' ? 'chat' : 'post',
      postId: kind === 'chat' ? '' : pid,
      chatId: kind === 'chat' ? pid : '',
      module: kind === 'chat' ? 'chat' : (DB.findOne('posts', function (x) { return x.id === pid; }) || {}).module || '',
      reporterId: me.id,
      reason: reason.trim(),
      status: 'pending'
    });
    alert('已上报学生会与管理员，感谢你的反馈，我们将尽快核实处理。');
  }

  /* ---------- 点赞 / 取消点赞（每人每帖一次） ---------- */
  function doLike(pid) {
    var me = Auth.currentUser();
    if (!me) { alert('请先登录后再点赞。'); return; }
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    if (!p) return;
    var likes = (p.likes || []).slice();
    var i = likes.indexOf(me.id);
    if (i >= 0) likes.splice(i, 1); else likes.push(me.id);
    DB.update('posts', pid, { likes: likes });
  }
  function likeComment(pid, cid) {
    var me = Auth.currentUser();
    if (!me) { alert('请先登录后再点赞。'); return; }
    var c = DB.findOne('comments', function (x) { return x.id === cid; });
    if (!c) return;
    var likes = (c.likes || []).slice();
    var i = likes.indexOf(me.id);
    if (i >= 0) likes.splice(i, 1); else likes.push(me.id);
    DB.update('comments', cid, { likes: likes });
  }

  /* ---------- 置顶 / 取消置顶（教师/领导/学生会/管理员） ---------- */
  function doPin(pid, done) {
    var me = Auth.currentUser();
    if (!me || !Perm.can(me.role, 'post.pin')) { alert('仅教师、领导、学生会与管理员可置顶内容。'); return; }
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    if (!p) return;
    DB.update('posts', pid, { pinned: !p.pinned });
    if (done) done();
  }

  /* ---------- 删除（有权角色或作者本人），同时清理其评论 ---------- */
  function canDelete(p, me) {
    return !!(me && (Perm.can(me.role, 'post.delete') || p.authorId === me.id));
  }
  function doDel(pid, done) {
    var me = Auth.currentUser();
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    if (!p || !me) return;
    if (!canDelete(p, me)) { alert('仅教师、领导、学生会、管理员或发帖人本人可删除。'); return; }
    if (!confirm('确定删除该内容吗？删除后不可恢复。')) return;
    DB.find('comments', function (c) { return c.postId === pid; })
      .forEach(function (c) { DB.remove('comments', c.id); });
    DB.remove('posts', pid);
    if (done) done();
  }
  function delComment(cid, done) {
    var me = Auth.currentUser();
    var c = DB.findOne('comments', function (x) { return x.id === cid; });
    if (!c || !me) return;
    var post = DB.findOne('posts', function (x) { return x.id === c.postId; });
    if (!(Perm.can(me.role, 'post.delete') || c.authorId === me.id || (post && post.authorId === me.id))) {
      alert('仅教师、领导、学生会、管理员、发帖人或评论者本人可删除评论。'); return;
    }
    if (!confirm('确定删除该条评论吗？')) return;
    DB.remove('comments', cid);
    if (done) done();
  }

  /* ---------- 学习资料下载：附件 dataURL 直下，否则生成文本文件 ---------- */
  function download(p) {
    var a = document.createElement('a');
    if (p.fileURL) {
      a.href = p.fileURL;
      a.download = p.fileName || ('资料-' + p.title + '.bin');
    } else {
      var blob = new Blob(['黄冈中学校园网 — 学习资料（演示数据）\n\n标题：' + (p.title || '') +
        '\n年级：' + (p.grade || '不限') + '　学科：' + (p.subject || '不限') +
        '\n\n内容：\n' + (p.content || '')], { type: 'text/plain;charset=utf-8' });
      a.href = URL.createObjectURL(blob);
      a.download = (p.title || '学习资料') + '.txt';
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    DB.update('posts', p.id, { downloads: (p.downloads || 0) + 1 });
  }

  /* ---------- 评论提交（先过文明检测） ---------- */
  function sendComment(pid, textarea, images, done, files) {
    var me = Auth.currentUser();
    if (!me) { alert('请先登录后再评论。'); return; }
    var text = textarea.value.trim();
    if (!text && !(images && images.length)) { alert('想说点什么再发送吧（文字或图片至少一项）。'); return; }
    if (text) {
      var g = Civility.guard(text, { module: 'comment', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
    }
    var row = { postId: pid, authorId: me.id, content: text, images: images || [] };
    if (files && files.length) row.files = files;   // 向后兼容增量：评论附件
    DB.insert('comments', row);
    textarea.value = '';
    if (done) done();
  }

  /* ---------- 卡片渲染 ---------- */
  function roleTag(role) {
    if (!role) return '';
    var c = Common.ROLE_COLORS[role] || '#1460a8';
    return '<span class="role-tag" style="color:' + c + ';border-color:' + c + '">' +
      Common.esc(Common.roleLabel(role)) + '</span>';
  }

  function headHtml(p, me, author) {
    var name, av;
    if (p.anonymous) {
      var isMe = me && me.id === p.authorId;
      name = isMe ? '匿名同学（我）' : '匿名同学';
      av = '<span class="avatar" style="background:#8aa0b5">匿</span>';
    } else {
      name = author ? (author.nickname || author.name) : '示例用户';
      av = Common.avatarHtml(author);
    }
    var chips = '';
    if (p.pinned) chips += '<span class="chip chip-pin">📌 已置顶</span>';
    return '<div class="p-head">' + av +
      '<div class="p-who"><b>' + Common.esc(name) + '</b>' +
      (p.anonymous ? '' : roleTag(author && author.role)) +
      '<time>' + Common.fmtTime(p.createdAt) + '</time></div>' +
      '<div class="p-chips">' + chips + '</div></div>';
  }

  /* 附件卡片（ bubbles / 帖子正文通用；ChatUI 未加载时降级显示字节） */
  function fileCardHtml(f) {
    if (!f || !f.url) return '';
    var sz = (typeof ChatUI !== 'undefined') ? ChatUI.fmtSize(f.size) : ((f.size || 0) + 'B');
    return '<div class="b-file"><span class="b-fi">📎</span>' +
      '<span class="b-fmain"><span class="b-fn">' + Common.esc(f.name || '附件') + '</span>' +
      '<span class="b-fs">' + sz + '</span></span>' +
      '<a href="' + f.url + '" download="' + Common.esc(f.name || '附件') + '">下载</a></div>';
  }

  function bodyHtml(p, extraChips) {
    var h = '';
    if (extraChips) h += '<div class="p-chips p-chips-body">' + extraChips + '</div>';
    if (p.title) h += '<h3 class="p-title">' + Common.esc(p.title) + '</h3>';
    h += '<div class="p-content">' + Common.esc(p.content) + '</div>';
    var imgs = p.images || [];
    if (imgs.length) {
      h += '<div class="p-imgs">';
      for (var i = 0; i < imgs.length; i++) h += '<img src="' + imgs[i] + '" alt="帖子配图">';
      h += '</div>';
    }
    var files = p.files || [];
    if (files.length) {
      h += '<div class="p-files">';
      for (var j = 0; j < files.length; j++) h += fileCardHtml(files[j]);
      h += '</div>';
    }
    return h;
  }

  function cardHtml(p, opts) {
    opts = opts || {};
    var me = Auth.currentUser();
    var author = DB.findOne('users', function (u) { return u.id === p.authorId; });
    var likes = (p.likes || []).length;
    var cmts = DB.find('comments', function (c) { return c.postId === p.id; }).length;
    var liked = me && (p.likes || []).indexOf(me.id) >= 0;

    var acts =
      '<button type="button" class="pact' + (liked ? ' on' : '') + '" data-act="like" data-pid="' + p.id + '">👍 点赞 ' + likes + '</button>' +
      '<button type="button" class="pact" data-act="cmt" data-pid="' + p.id + '">💬 评论 ' + cmts + '</button>' +
      '<button type="button" class="pact" data-act="share" data-pid="' + p.id + '">⤴ 分享 ' + (p.shares || 0) + '</button>' +
      '<button type="button" class="pact" data-act="report" data-pid="' + p.id + '">🚩 上报</button>' +
      (me && !p.anonymous && p.authorId && p.authorId !== me.id && Perm.can(me.role, 'account.report')
        ? '<button type="button" class="pact" data-act="rep-user" data-uid="' + p.authorId + '">👤 上报账户</button>' : '') +
      (opts.download ? '<button type="button" class="pact pact-primary" data-act="download" data-pid="' + p.id + '">⬇ 下载 ' + (p.downloads || 0) + '</button>' : '') +
      (me && Perm.can(me.role, 'post.pin') ? '<button type="button" class="pact" data-act="pin" data-pid="' + p.id + '">' + (p.pinned ? '取消置顶' : '📌 置顶') + '</button>' : '') +
      (me && canDelete(p, me) ? '<button type="button" class="pact pact-danger" data-act="del" data-pid="' + p.id + '">🗑 删除</button>' : '');

    var cmtBox = '';
    if (opts.comments) {
      /* QQ 式评论框：文本框 + 工具条（表情/图片/发送） */
      cmtBox =
        '<div class="cmt-area" id="cmt-area-' + p.id + '" hidden>' +
          '<div class="cmt-list" id="cmt-list-' + p.id + '">' + commentListHtml(p, opts) + '</div>' +
          (me ? '<div class="cmt-box">' +
              '<textarea id="cmt-input-' + p.id + '" rows="2" placeholder="写下你的评论…"></textarea>' +
              '<div class="cmt-foot">' +
                '<button type="button" class="ct-btn" data-emoji-btn data-emoji-target="#cmt-input-' + p.id + '">😊 表情</button>' +
                (opts.commentImage ?
                  '<button type="button" class="ct-btn" data-act="cmt-img" data-pid="' + p.id + '">🖼 图片</button>' +
                  '<span id="cmt-imgpre-' + p.id + '" class="cmt-imgpre"></span>' +
                  '<input type="file" id="cmt-file-' + p.id + '" accept="image/*" hidden>' : '') +
                '<span class="spacer"></span>' +
                '<button type="button" class="btn btn-primary btn-sm" data-act="cmt-send" data-pid="' + p.id + '">发送</button>' +
              '</div>' +
            '</div>' : '<div class="cmt-login-tip">登录后即可发表评论。</div>') +
        '</div>';
    }

    return '<article class="post card" id="post-' + p.id + '">' +
      headHtml(p, me, author) +
      bodyHtml(p, opts.chips ? opts.chips(p) : '') +
      '<div class="p-meta">👍 ' + likes + ' · 💬 ' + cmts + ' · 👁 看过 ' + (p.views || 0) + '</div>' +
      '<div class="p-actions">' + acts + '</div>' +
      cmtBox +
      '</article>';
  }

  function commentListHtml(p, opts) {
    var me = Auth.currentUser();
    var list = DB.find('comments', function (c) { return c.postId === p.id; });
    list = sortComments(list, !!opts.qaPin);
    if (!list.length) return '<div class="cmt-empty">还没有评论，来抢沙发～</div>';
    /* QQ 式气泡：本人评论居右（渐变气泡），同人 5 分钟内连续评论合并样式 */
    var h = '<div class="b-list">', prev = null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var u = DB.findOne('users', function (x) { return x.id === c.authorId; });
      var staff = isStaffComment(c);
      var pinned = staff && opts.qaPin;
      var mine = !!(me && c.authorId === me.id);
      var cont = !pinned && !!prev && prev.authorId === c.authorId &&
        Math.abs((c.createdAt || 0) - (prev.createdAt || 0)) < 5 * 60 * 1000;
      var imgs = c.images || [];
      var files = c.files || [];
      h += '<div class="b-row' + (mine ? ' mine' : '') + (cont ? ' b-cont' : '') + (pinned ? ' cmt-pinned' : '') +
        '" id="cmt-' + c.id + '">' +
        '<span class="b-av">' + (cont ? '' : Common.avatarHtml(u)) + '</span>' +
        '<div class="b-main">' +
          '<div class="b-meta"><b>' + Common.esc(u ? (u.nickname || u.name) : '示例用户') + '</b>' +
            (cont ? '' : roleTag(u && u.role)) +
            (pinned ? '<span class="chip chip-pin">📌 置顶</span>' : '') +
            '<time>' + Common.fmtTime(c.createdAt) + '</time></div>' +
          '<div class="b-bubble">' + Common.esc(c.content) +
            (imgs.length ? '<div class="b-imgs">' + imgs.map(function (s) { return '<img src="' + s + '" alt="跟帖配图">'; }).join('') + '</div>' : '') +
            (files.length ? '<div class="b-files">' + files.map(fileCardHtml).join('') + '</div>' : '') +
          '</div>' +
          '<div class="b-acts show">' +
            '<button type="button" data-act="cmt-like" data-pid="' + p.id + '" data-cid="' + c.id + '"' +
              (me && (c.likes || []).indexOf(me.id) >= 0 ? ' class="on"' : '') + '>👍 ' + ((c.likes || []).length) + '</button>' +
            (me && (Perm.can(me.role, 'post.delete') || c.authorId === me.id) ?
              '<button type="button" class="b-danger" data-act="cmt-del" data-pid="' + p.id + '" data-cid="' + c.id + '">删除</button>' : '') +
          '</div>' +
        '</div></div>';
      prev = c;
    }
    return h + '</div>';
  }

  /* ---------- 账户上报（管理类角色 → 管理员后台核实处理） ----------
     闭环：此处写入 reports（type=account）→ 管理后台「上报处理」面板处置 →
     可公示到「网站违规通报」模块 / 警告 / 封禁（见 moderate.js）。 */
  function doAccountReport(targetId) {
    var me = Auth.currentUser();
    if (!me || !Perm.can(me.role, 'account.report')) { alert('仅教职工与管理员可上报账户。'); return; }
    var t = DB.findOne('users', function (u) { return u.id === targetId; });
    if (!t) { alert('目标账户不存在。'); return; }
    if (t.id === me.id) { alert('不能上报自己。'); return; }
    var reason = prompt('上报账户「' + (t.nickname || t.name) + '」，请填写理由（将提交管理员核实处理）：');
    if (reason === null) return;
    reason = String(reason).trim();
    if (!reason) { alert('请填写上报理由。'); return; }
    var g = Civility.guard(reason, { module: 'account', authorId: me.id });
    if (!g.ok) { alert(g.msg); return; }
    DB.insert('reports', {
      type: 'account', module: 'account',
      targetUserId: t.id, targetName: (t.nickname || t.name),
      reporterId: me.id, reason: reason, status: 'pending'
    });
    alert('已上报管理员，可在「网站违规通报」模块查看后续处理公示。');
  }

  /* ---------- 列表渲染 + 事件委托（容器级，一次绑定） ---------- */
  var openSet = {};   // 已展开评论区的帖子 id（重渲染后保持展开）

  function showCmt(root, pid, open) {
    var area = root.querySelector('#cmt-area-' + pid);
    if (!area) return;
    area.hidden = !open;
  }

  function refreshComments(root, pid, opts) {
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    var box = root.querySelector('#cmt-list-' + pid);
    if (p && box) box.innerHTML = commentListHtml(p, opts || {});
  }

  function render(root, posts, opts) {
    opts = opts || {};
    for (var i = 0; i < posts.length; i++) {                       // 看过 +1（每浏览器一次）
      var nv = incView(posts[i].id);
      if (nv !== null) posts[i].views = nv;   // 同步内存行，首次渲染即显示新计数
    }
    root.innerHTML = posts.length
      ? posts.map(function (p) { return cardHtml(p, opts); }).join('')
      : '<div class="card empty-card">' + Common.esc(opts.empty || '暂无内容，快来发布第一条吧。') + '</div>';

    if (!root._uiBound) {
      root._uiBound = true;
      root.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var pid = btn.getAttribute('data-pid');
        var cid = btn.getAttribute('data-cid');
        if (act === 'like') { doLike(pid); opts.rerender && opts.rerender(); }
        else if (act === 'cmt') {
          openSet[pid] = !openSet[pid];
          showCmt(root, pid, openSet[pid]);
        }
        else if (act === 'share') { doShare(pid, function () { opts.rerender && opts.rerender(); }); }
        else if (act === 'report') { doReport(pid); }
        else if (act === 'rep-user') { doAccountReport(btn.getAttribute('data-uid')); }
        else if (act === 'pin') { doPin(pid, function () { opts.rerender && opts.rerender(); }); }
        else if (act === 'del') { doDel(pid, function () { delete openSet[pid]; opts.rerender && opts.rerender(); }); }
        else if (act === 'download') {
          var p = DB.findOne('posts', function (x) { return x.id === pid; });
          if (p) { download(p); opts.rerender && opts.rerender(); }
        }
        else if (act === 'cmt-send') {
          var input = root.querySelector('#cmt-input-' + pid);
          var imgs = [];
          var pre = root.querySelector('#cmt-imgpre-' + pid);
          if (pre && pre.dataset.url) imgs = [pre.dataset.url];
          sendComment(pid, input, imgs, function () {
            if (pre) { delete pre.dataset.url; pre.innerHTML = ''; }
            opts.rerender && opts.rerender();   // 重渲染后 openSet 保持该帖评论区展开
          });
        }
        else if (act === 'cmt-like') { likeComment(pid, cid); refreshComments(root, pid, opts); }
        else if (act === 'cmt-del') { delComment(cid, function () { refreshComments(root, pid, opts); opts.rerender && opts.rerender(); }); }
        else if (act === 'cmt-img') {   /* 评论配图入口按钮 → 触发隐藏的图片选择框 */
          var finp = root.querySelector('#cmt-file-' + pid);
          if (finp) finp.click();
        }
      });

      /* 评论配图：选择即压缩预览（仅 event 等开启 commentImage 的模块） */
      root.addEventListener('change', function (e) {
        var inp = e.target.closest ? e.target.closest('input[type="file"][id^="cmt-file-"]') : null;
        if (!inp || !inp.files || !inp.files[0]) return;
        var pid = inp.id.replace('cmt-file-', '');
        var pre = root.querySelector('#cmt-imgpre-' + pid);
        Common.compressImage(inp.files[0], 800, function (durl) {
          if (!durl) { alert('图片读取失败，请换一张试试。'); return; }
          if (pre) { pre.dataset.url = durl; pre.innerHTML = '<img src="' + durl + '" alt="预览">'; }
        });
      });
    }

    /* 恢复展开状态 + 深链 ?pid= 定位 */
    for (var k = 0; k < posts.length; k++) {
      if (openSet[posts[k].id]) showCmt(root, posts[k].id, true);
    }
    var target = Common.q('pid');
    if (target) {
      var el = document.getElementById('post-' + target);
      if (el) {
        el.classList.add('highlight');
        openSet[target] = 1;
        showCmt(root, target, true);
        setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
      }
    }
  }

  /* 模块页头部 */
  function pageHead(mKey) {
    var m = Common.getModule(mKey);
    if (!m) return;
    document.title = m.name + ' — 黄冈中学校园网';
    var el = document.getElementById('moduleHead');
    if (el) el.innerHTML =
      '<span class="mh-icon">' + m.icon + '</span>' +
      '<div><h1>' + Common.esc(m.name) + '</h1><p>' + Common.esc(m.desc) + '</p></div>';
  }

  return {
    canSeeLife: canSeeLife, visLabel: visLabel,
    sortPosts: sortPosts, sortComments: sortComments, isStaffComment: isStaffComment,
    incView: incView, copyText: copyText,
    doShare: doShare, doReport: doReport, doAccountReport: doAccountReport,
    doLike: doLike, doPin: doPin, doDel: doDel,
    canDelete: canDelete, download: download, sendComment: sendComment,
    render: render, refreshComments: refreshComments, pageHead: pageHead
  };
})();
