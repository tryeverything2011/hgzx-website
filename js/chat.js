/* ==========================================================================
   chat.js — 闲聊吧（黄冈中学校园网）· 微信群聊式
   丘班 / 高一 / 高二 / 高三 / 总群 五个分区，内容所有人可见；
   左侧分区会话列表（含最近一条消息预览）+ 右侧聊天窗口（移动端上下折叠）；
   QQ 式气泡（本人消息居右、同人短时连续消息合并、日期分隔条）；
   历史消息关键词搜索（检索当前分区记录，命中高亮、可一键退出）；
   附件：图片沿用 Common.compressImage（≤300KB）+ 常见文件（≤1MB 超限拒绝），
   由 ChatUI 工具栏采集，随消息向后兼容增量写入（images/files 数组）；
   消息操作：点赞 / 分享 / 一键上报 / 删除（有权角色或本人，口径不变）；
   分区累计浏览人数（每浏览器每区每会话计 1 次，口径不变）。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('chat');

  var ZONES = ['丘班', '高一', '高二', '高三', '总群'];
  var ZAVS = ['丘', '一', '二', '三', '总'];
  var me = Auth.currentUser();
  var cur = Common.q('zone') && ZONES.indexOf(Common.q('zone')) >= 0 ? Common.q('zone') : '总群';
  var kw = '';            /* 当前搜索关键词（空 = 正常浏览） */

  var zoneListBox = document.getElementById('zoneList');
  var msgsBox = document.getElementById('wxMsgs');
  var input = document.getElementById('chatInput');
  var kwBox = document.getElementById('wxKw');

  /* ---- 分区会话列表（最近一条消息预览，微信风格） ---- */
  function lastOf(z) {
    var rows = DB.find('chats', function (c) { return c.zone === z; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return rows[0] || null;
  }
  function zonePreview(c) {
    if (!c) return '暂无消息，等你来开聊～';
    var who = '';
    if (c.authorId === me.id) who = '我：';
    else {
      var u = DB.findOne('users', function (x) { return x.id === c.authorId; });
      who = u ? ((u.nickname || u.name) + '：') : '';
    }
    if (c.images && c.images.length && !c.content) who += '[图片]';
    if (c.files && c.files.length && !c.content) who += '[附件]';
    return who + Common.snippet(c.content || '', 18);
  }
  function drawZones() {
    var h = '';
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i], last = lastOf(z);
      h += '<button type="button" class="wx-zone' + (z === cur ? ' on' : '') + '" data-zone="' + z + '">' +
        '<span class="wx-zav">' + ZAVS[i] + '</span>' +
        '<span class="wx-zmain"><span class="wx-zname">' + Common.esc(z) + '</span>' +
        '<span class="wx-zlast">' + Common.esc(zonePreview(last)) + '</span></span>' +
        (last ? '<span class="wx-ztime">' + ChatUI.dateLabel(last.createdAt) + '</span>' : '') +
        '</button>';
    }
    zoneListBox.innerHTML = h;
  }
  zoneListBox.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-zone]') : null;
    if (!b) return;
    if (cur === b.getAttribute('data-zone')) return;
    cur = b.getAttribute('data-zone');
    exitSearch(true);
    render();
  });

  /* ---- 发言（先过文明检测；支持纯图片/纯附件消息） ---- */
  document.getElementById('btnSend').addEventListener('click', function () {
    var text = input.value.trim();
    var att = ChatUI.take(document.getElementById('wxComposer'));
    if (!text && !att.images.length && !att.files.length) {
      alert('想说点什么，或添加图片/附件再发送吧。'); return;
    }
    if (text) {
      var g = Civility.guard(text, { module: 'chat', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
    }
    var row = { zone: cur, authorId: me.id, content: text };
    if (att.images.length) row.images = att.images;
    if (att.files.length) row.files = att.files;
    if (!DB.insert('chats', row)) {
      alert('发送失败：浏览器存储空间可能已满。'); return;
    }
    input.value = '';
    kw = '';
    kwBox.value = '';
    document.getElementById('btnSearchExit').hidden = true;
    document.getElementById('searchCount').textContent = '';
    render();
  });

  /* ---- 历史消息搜索（当前分区已加载记录，命中高亮） ---- */
  function searchHit(c) {
    if (c.content && c.content.toLowerCase().indexOf(kw.toLowerCase()) >= 0) return true;
    if (c.files) {
      for (var i = 0; i < c.files.length; i++) {
        if ((c.files[i].name || '').toLowerCase().indexOf(kw.toLowerCase()) >= 0) return true;
      }
    }
    return false;
  }
  function doSearch() {
    kw = kwBox.value.trim();
    if (!kw) { exitSearch(false); return; }
    document.getElementById('btnSearchExit').hidden = false;
    render();
  }
  function exitSearch(silent) {
    kw = '';
    kwBox.value = '';
    document.getElementById('btnSearchExit').hidden = true;
    document.getElementById('searchCount').textContent = '';
    if (!silent) render();
  }
  document.getElementById('btnSearch').addEventListener('click', doSearch);
  document.getElementById('btnSearchExit').addEventListener('click', function () { exitSearch(false); });
  kwBox.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    if (e.key === 'Escape') exitSearch(false);
  });

  /* ---- 分区累计浏览人数（每浏览器每区每会话仅计一次，口径不变） ---- */
  function zoneViews(z) {
    var m = DB.get('chatViews', {});
    return m[z] || 0;
  }
  function countZoneView(z) {
    var k = 'chatSeen_' + z;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { return; }
    var m = DB.get('chatViews', {});
    m[z] = (m[z] || 0) + 1;
    DB.set('chatViews', m);
  }

  /* ---- 消息气泡渲染（升序、日期分隔、同人连续合并） ---- */
  function msgHtml(c, prev) {
    var u = DB.findOne('users', function (x) { return x.id === c.authorId; });
    var mine = c.authorId === me.id;
    var liked = (c.likes || []).indexOf(me.id) >= 0;
    var canDel = me && (Perm.can(me.role, 'post.delete') || c.authorId === me.id);
    var cont = !!prev && prev.authorId === c.authorId &&
      (c.createdAt || 0) - (prev.createdAt || 0) < 5 * 60 * 1000;

    var imgs = c.images || [];
    var files = c.files || [];
    var body = (kw ? ChatUI.highlight(c.content, kw) : Common.esc(c.content)) || '';
    if (!body && imgs.length) body = '<span style="opacity:.75;font-size:12px">[图片]</span>';
    if (imgs.length) {
      body += '<div class="b-imgs">' + imgs.map(function (s) {
        return '<img src="' + s + '" alt="聊天图片">';
      }).join('') + '</div>';
    }
    if (files.length) {
      body += '<div class="b-files">' + files.map(function (f) {
        return '<div class="b-file"><span class="b-fi">📎</span>' +
          '<span class="b-fmain"><span class="b-fn">' + Common.esc(f.name || '附件') + '</span>' +
          '<span class="b-fs">' + ChatUI.fmtSize(f.size) + '</span></span>' +
          '<a href="' + f.url + '" download="' + Common.esc(f.name || '附件') + '">下载</a></div>';
      }).join('') + '</div>';
    }

    return '<div class="b-row' + (mine ? ' mine' : '') + (cont ? ' b-cont' : '') + '" id="post-' + c.id + '">' +
      '<span class="b-av">' + (cont ? '' : Common.avatarHtml(u)) + '</span>' +
      '<div class="b-main">' +
        '<div class="b-meta"><b>' + Common.esc(u ? (u.nickname || u.name) : '示例用户') + '</b>' +
          '<time>' + Common.fmtTime(c.createdAt) + '</time></div>' +
        '<div class="b-bubble">' + body + '</div>' +
        '<div class="b-acts">' +
          '<button type="button" data-act="like" data-cid="' + c.id + '"' + (liked ? ' class="on"' : '') + '>👍 赞 ' + ((c.likes || []).length) + '</button>' +
          '<button type="button" data-act="share" data-cid="' + c.id + '">⤴ 分享</button>' +
          '<button type="button" data-act="report" data-cid="' + c.id + '">🚩 上报</button>' +
          (canDel ? '<button type="button" class="b-danger" data-act="del" data-cid="' + c.id + '">🗑 删除</button>' : '') +
        '</div>' +
        (likesLine(c)) +
      '</div></div>';
  }
  function likesLine(c) {
    var n = (c.likes || []).length;
    if (!n) return '';
    return '<div class="b-like-n">❤ ' + n + ' 人觉得赞</div>';
  }

  function render() {
    countZoneView(cur);
    drawZones();
    document.getElementById('wxZoneName').textContent = cur + '群聊';
    document.getElementById('wxZoneSub').textContent =
      '本区累计 ' + zoneViews(cur) + ' 人次看过 · 发言所有人可见';

    var rows = DB.find('chats', function (c) { return c.zone === cur; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });  // 升序：旧消息在上
    var shown = rows;
    if (kw) {
      shown = rows.filter(searchHit);
      document.getElementById('searchCount').textContent = '找到 ' + shown.length + ' 条';
    }

    if (!shown.length) {
      msgsBox.innerHTML = '<div class="wx-empty">' +
        (kw ? '没有找到与「' + Common.esc(kw) + '」相关的消息，换个关键词试试～'
            : '这个分区还没有消息，来说第一句吧～') + '</div>';
      return;
    }

    var h = '', prev = null, prevDay = '';
    for (var i = 0; i < shown.length; i++) {
      var c = shown[i];
      var day = ChatUI.dateLabel(c.createdAt);
      if (day !== prevDay) {
        h += '<div class="b-date"><span>' + Common.esc(day) + '</span></div>';
        prev = null;          /* 跨日期不合并 */
        prevDay = day;
      }
      h += msgHtml(c, prev);
      prev = c;
    }
    msgsBox.innerHTML = h;
    msgsBox.scrollTop = msgsBox.scrollHeight;   // 自动滚到最新消息
  }

  /* ---- 消息操作（点赞 / 分享 / 上报 / 删除，口径与数据结构不变） ---- */
  msgsBox.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var cid = btn.getAttribute('data-cid');
    var c = DB.findOne('chats', function (x) { return x.id === cid; });
    if (!c) return;
    if (act === 'like') {
      var likes = (c.likes || []).slice();
      var i = likes.indexOf(me.id);
      if (i >= 0) likes.splice(i, 1); else likes.push(me.id);
      DB.update('chats', cid, { likes: likes });
      render();
    } else if (act === 'share') {
      var text = '【闲聊吧·' + c.zone + '】' + Common.snippet(c.content, 60) + ' —— 来自黄冈中学校园网';
      PostUI.copyText(text, function (ok) {
        DB.update('chats', cid, { shares: (c.shares || 0) + 1 });
        alert(ok ? '消息文案已复制，可粘贴发送给QQ好友或同学。' : '复制失败，请长按消息手动复制。');
      });
    } else if (act === 'report') {
      PostUI.doReport(cid, 'chat');
    } else if (act === 'del') {
      if (!confirm('确定删除该条消息吗？')) return;
      DB.remove('chats', cid);
      render();
    }
  });

  /* 工具栏（表情 / 图片 / 附件）注入到输入区 */
  ChatUI.injectComposer(document.getElementById('wxComposer'));

  render();
})();
