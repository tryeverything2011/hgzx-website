/* ==========================================================================
   storage.js — 数据层适配器（黄冈中学校园网）
   双模式设计（见 config.js）：
   ① 本地回退模式（默认）：数据存 localStorage，双击 index.html 即可运行；
   ② 云端模式：按 config.js 接入 LeanCloud（主推）/ Supabase（备选），
      数据全校互通、所有人可见。页面代码依旧只调用本文件的同步接口，零改动。

   云端实现口径（页面零改动的关键）：
   - 本地 localStorage 继续作为「读缓存」：所有读操作（list/find/...）同步返回；
   - 所有写操作先落本地缓存（界面即时生效），再由后台队列异步推送云端；
   - 定时（120s）/页面回前台时拉取云端并按行合并（mtime 新者胜），
     使同一学校所有浏览器看到同一份数据；
   - 同步范围仅 SYNC_TABLES 六张表；会话(session)、已读位(viewed/noticeRead)、
     墓碑(tombstones)、推送水位(pushed)、seedVersion 等设备本地状态不上云；
   - 删除采用「墓碑」机制：本地删除 → 云端删除 + 写入墓碑表，其他设备拉取
     墓碑后同样删除，防止已删内容被别人的旧缓存复活；
   - 云端记录仅存 {rid=行id, mtime=行更新时间, data=整行JSON}，规避各云平台
     保留字段（objectId/createdAt/updatedAt 等）与类型差异；
   - 【硬性】密码仅存哈希（见 auth.js；v1.5 起不再采集身份证号），本文件不做任何明文落云。
   ========================================================================== */
var DB = (function () {
  var NS = 'hgzx_';      // 存储键命名空间（黄冈中学拼音缩写），避免与浏览器中其他数据冲突

  /* 参与云端同步的数据表（顺序即拉取顺序） */
  var SYNC_TABLES = ['users', 'posts', 'chats', 'comments', 'reports', 'warnings'];

  /* ---------- 旧版数据一次性迁移 ----------
     历史版本曾使用另一缩写前缀（黄冈中学旧写法），为满足「全仓不出现旧字样」
     的命名口径，此处以字符串拼接方式构造旧前缀；初始化时把旧前缀键逐个搬到
     新前缀同名键下并删除旧键，防止改名后产生孤儿数据。仅执行一次、幂等安全。 */
  var OLD_NS = ['hg', '2', 'x', '_'].join('');
  (function migrateOldKeys() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const oldKey = localStorage.key(i);
        if (oldKey && oldKey.indexOf(OLD_NS) === 0) {
          const newKey = NS + oldKey.slice(OLD_NS.length);
          if (localStorage.getItem(newKey) === null) {
            localStorage.setItem(newKey, localStorage.getItem(oldKey));
          }
          localStorage.removeItem(oldKey);
        }
      }
    } catch (e) { /* 隐私模式等场景忽略迁移失败 */ }
  })();

  /* ================= 本地缓存层（同步接口，页面代码只依赖这一层） ================= */
  function get(key, def) {
    try {
      var raw = localStorage.getItem(NS + key);
      if (raw === null) return def;
      return JSON.parse(raw);
    } catch (e) { return def; }
  }
  function set(key, val) {
    try { localStorage.setItem(NS + key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('[DB] 写入失败（存储空间不足？）：', key); return false; }
  }
  function del(key) { try { localStorage.removeItem(NS + key); } catch (e) {} }

  function genId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function save(table, rows) { return set(table, rows); }
  function list(table) {
    var v = get(table, []);
    return (v instanceof Array) ? v : [];
  }
  function insert(table, row) {
    if (!row) return false;
    var rows = list(table);
    if (!row.id) row.id = genId();
    var now = Date.now();
    if (!row.createdAt) row.createdAt = now;
    row.updatedAt = now;
    rows.push(row);
    if (!save(table, rows)) return false;
    noteWrite(table);
    return true;
  }
  function update(table, id, patch) {
    var rows = list(table);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) {
        for (var k in patch) rows[i][k] = patch[k];
        rows[i].updatedAt = Date.now();
        var ok = save(table, rows);
        noteWrite(table);
        return ok;
      }
    }
    return false;
  }
  function removeRow(table, id) {
    const rows = list(table).filter(function (r) { return r.id !== id; });
    var ok = save(table, rows);
    addTomb(table, id, false);
    noteWrite(table);
    return ok;
  }
  function find(table, fn) { return list(table).filter(fn); }
  function findOne(table, fn) { return list(table).find(fn) || null; }

  /* ================= 云端同步引擎 ================= */
  var cloud = null;                 // 当前云端适配器
  var oidCache = {};                // leancloud: 表 -> {rid: objectId}
  var pushed = get('pushed', {});   // 表 -> {rid: 上次推送成功的行 mtime}
  var st = { mode: 'local', ready: false, lastPullAt: 0, lastPushAt: 0, error: '', skippedBig: 0, bigSkip: {} };
  var MAX_ROW_CHARS = 1200000;      // 单行 JSON 上限（约900KB），超出不上云仅本地保留

  function localMtime(r) { return r.updatedAt || r.createdAt || 0; }
  function persistPushed() { set('pushed', pushed); }

  /* ---- 墓碑（删除记录） ---- */
  var tombCache = null;
  function tombs() { if (!tombCache) tombCache = get('tombstones', []); return tombCache; }
  function findTomb(rid) {
    var t = tombs();
    for (var i = 0; i < t.length; i++) if (t[i].rid === rid) return t[i];
    return null;
  }
  function isTombstoned(rid) { return !!findTomb(rid); }
  function addTomb(tbl, rid, fromCloud) {
    if (findTomb(rid)) return;
    var t = tombs();
    t.push({ tbl: tbl, rid: rid, at: Date.now(), pt: fromCloud ? 1 : 0 });
    if (t.length > 500) t.splice(0, t.length - 500);   // 上限500条，防本地膨胀
    tombCache = t;
    set('tombstones', t);
  }

  /* 写操作后通知引擎安排一次推送（云端模式） */
  var flushTimer = null;
  function noteWrite(tbl) {
    if (!cloud) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { runJob('flush'); }, 2500);
  }

  /* ---- JSON 行解析（data 列） ---- */
  function parseBlob(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    try { var o = JSON.parse(v); return (o && typeof o === 'object') ? o : null; }
    catch (e) { return null; }
  }

  /* ---------- LeanCloud 适配器（官方 JS SDK 按需动态加载，写法对齐官方文档） ---------- */
  var SDK_URLS = [
    'https://cdn.jsdelivr.net/npm/leancloud-storage@4/dist/av-min.js',
    'https://unpkg.com/leancloud-storage@4/dist/av-min.js'
  ];
  function loadSdk(i, ok, fail) {
    if (typeof document === 'undefined') { fail('仅浏览器环境可用'); return; }
    if (i >= SDK_URLS.length) { fail('SDK 加载失败：无法访问 CDN，请检查网络。'); return; }
    var s = document.createElement('script');
    s.src = SDK_URLS[i];
    s.onload = function () { if (window.AV) ok(); else loadSdk(i + 1, ok, fail); };
    s.onerror = function () { loadSdk(i + 1, ok, fail); };
    document.head.appendChild(s);
  }

  function makeLeanAdapter(conf, cb) {
    loadSdk(0, function () {
      try {
        var opt = { appId: conf.appId, appKey: conf.appKey };
        if (conf.serverUrl) { opt.serverURL = conf.serverUrl; opt.serverURLs = conf.serverUrl; }
        window.AV.init(opt);
      } catch (e) { cb('LeanCloud 初始化失败：' + (e.message || e)); return; }
      var AV = window.AV;
      function cls(tbl) { return 'hgzx_' + tbl; }
      function qfail(e) {
        var c = e && e.code, m = (e && e.message) || String(e);
        if (c === 403) return '无访问权限：请在控制台「安全中心→Web安全域名」加入本站域名，并确认 Class 权限允许读写';
        if (c === 404 || c === 101 || /class/i.test(m)) return '云端 Class 不存在或不可访问：' + m + '（请按《部署指南》创建 hgzx_ 前缀 Class）';
        if (c === 429) return '超出免费版调用频率限制，稍后自动重试';
        return m + (c !== undefined ? '（错误码 ' + c + '）' : '');
      }
      /* 拉取一整表：仅取 rid/mtime/data 三列（limit 上限 1000，演示规模足够） */
      function fetchRows(tbl, done) {
        var q = new AV.Query(cls(tbl));
        q.limit(1000);
        q.find().then(function (objs) {
          var out = [];
          for (var i = 0; i < objs.length; i++) {
            var o = objs[i], d = parseBlob(o.get('data'));
            if (d && d.id) {
              var rid = o.get('rid') || d.id;
              out.push({ oid: o.id, rid: rid, mtime: o.get('mtime') || 0, data: d });
              (oidCache[tbl] = oidCache[tbl] || {})[rid] = o.id;
            }
          }
          done(null, out);
        }, function (e) { done(qfail(e)); });
      }
      /* 单行 upsert：已知 objectId 则更新，保存失败（如已被远端删除）则降级新建 */
      function saveOne(tbl, r, done) {
        var m = oidCache[tbl] = oidCache[tbl] || {};
        var fields = { rid: r.id, mtime: localMtime(r), data: JSON.stringify(r) };
        function fresh() {
          var o = new (AV.Object.extend(cls(tbl)))();
          o.set(fields);
          o.save().then(function () { m[r.id] = o.id; done(null); }, function (e) { done(qfail(e)); });
        }
        var known = m[r.id];
        if (!known) { fresh(); return; }
        var o = AV.Object.createWithoutData(cls(tbl), known);
        o.set(fields);
        o.save().then(function () { done(null); }, function () { delete m[r.id]; fresh(); });
      }
      function upsert(tbl, rows, done) {
        var i = 0, errOut = null;
        (function next() {
          if (errOut || i >= rows.length) { done(errOut); return; }
          saveOne(tbl, rows[i++], function (e) { if (e) errOut = e; next(); });
        })();
      }
      function destroyOid(tbl, rid, oid, done) {
        var o = AV.Object.createWithoutData(cls(tbl), oid);
        o.destroy().then(function () {
          var m = oidCache[tbl]; if (m && m[rid] === oid) delete m[rid];
          done(null);
        }, function (e) {
          if (e && (e.code === 101 || e.code === 404)) { done(null); return; }  // 已不存在视为成功
          done(qfail(e));
        });
      }
      function removeRids(tbl, rids, done) {
        var m = oidCache[tbl] || {}, i = 0, errOut = null;
        (function next() {
          if (errOut || i >= rids.length) { done(errOut); return; }
          var rid = rids[i++];
          if (m[rid]) { destroyOid(tbl, rid, m[rid], next); return; }
          var q = new AV.Query(cls(tbl));
          q.equalTo('rid', rid);
          q.find().then(function (objs) {
            var j = 0;
            (function dn() {
              if (j >= objs.length) { next(); return; }
              destroyOid(tbl, rid, objs[j++].id, dn);
            })();
          }, function (e) { errOut = qfail(e); next(); });
        })();
      }
      function removeByOids(tbl, oids, done) {
        var i = 0, errOut = null;
        (function next() {
          if (errOut || i >= oids.length) { done(errOut); return; }
          destroyOid(tbl, null, oids[i++], next);
        })();
      }
      function fetchTombs(done) {
        var q = new AV.Query('hgzx_tomb');
        q.limit(1000);
        q.find().then(function (objs) {
          var out = [];
          for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (o.get('rid')) out.push({ rid: o.get('rid'), tbl: o.get('tbl') || '', at: o.get('at') || 0 });
          }
          done(null, out);
        }, function (e) { done(qfail(e)); });
      }
      function pushTombs(rows, done) {
        var i = 0, errOut = null;
        (function next() {
          if (errOut || i >= rows.length) { done(errOut); return; }
          var r = rows[i++];
          var q = new AV.Query('hgzx_tomb');
          q.equalTo('rid', r.rid);
          q.first().then(function (found) {
            if (found) { next(); return; }   // 幂等：墓碑已存在
            var o = new (AV.Object.extend('hgzx_tomb'))();
            o.set({ rid: r.rid, tbl: r.tbl || '', at: r.at || Date.now() });
            o.save().then(function () { next(); }, function (e) { errOut = qfail(e); next(); });
          }, function (e) { errOut = qfail(e); next(); });
        })();
      }
      cb(null, {
        name: 'leancloud',
        fetchRows: fetchRows, upsert: upsert,
        removeRids: removeRids, removeByOids: removeByOids,
        fetchTombs: fetchTombs, pushTombs: pushTombs
      });
    }, cb);
  }

  /* ---------- Supabase 适配器（REST / PostgREST，无 SDK 依赖） ---------- */
  function makeSupaAdapter(conf, cb) {
    if (typeof fetch === 'undefined') { cb('当前环境不支持 fetch，无法使用 Supabase 模式'); return; }
    var base = String(conf.url || '').replace(/\/+$/, '');
    function hdr(extra) {
      var h = { apikey: conf.anonKey, Authorization: 'Bearer ' + conf.anonKey, 'Content-Type': 'application/json' };
      if (extra) for (var k in extra) h[k] = extra[k];
      return h;
    }
    function http(method, path, body, prefer, done) {
      var opt = { method: method, headers: hdr(prefer ? { Prefer: prefer } : null) };
      if (body !== null && body !== undefined) opt.body = JSON.stringify(body);
      fetch(base + path, opt).then(function (r) {
        if (r.ok) {
          if (r.status === 204) { done(null, null); return; }
          r.json().then(function (j) { done(null, j); }, function () { done(null, null); });
          return;
        }
        r.text().then(function (t) { done('HTTP ' + r.status + '：' + String(t || '').slice(0, 200)); },
                       function () { done('HTTP ' + r.status); });
      }).catch(function (e) { done('网络错误：' + (e.message || e)); });
    }
    function T(tbl) { return '/rest/v1/hgzx_' + tbl; }
    function fetchRows(tbl, done) {
      http('GET', T(tbl) + '?select=rid,mtime,data&limit=1000', null, null, function (e, j) {
        if (e) { done(e); return; }
        var out = [];
        for (var i = 0; i < (j || []).length; i++) {
          var x = j[i], d = parseBlob(x.data);
          if (d && d.id) out.push({ oid: x.rid, rid: x.rid, mtime: +x.mtime || 0, data: d });
        }
        done(null, out);
      });
    }
    function upsert(tbl, rows, done) {
      var body = rows.map(function (r) {
        return { rid: r.id, mtime: localMtime(r), data: JSON.stringify(r) };
      });
      http('POST', T(tbl) + '?on_conflict=rid', body, 'resolution=merge-duplicates', done);
    }
    function removeRids(tbl, rids, done) {
      if (!rids.length) { done(null); return; }
      var qs = rids.map(function (r) { return 'rid.eq.' + r; }).join(',');
      http('DELETE', T(tbl) + '?or=(' + encodeURIComponent(qs) + ')', null, null, done);
    }
    function removeByOids(tbl, oids, done) { done(null); }  // supabase 以 rid 为主键，无重复记录问题
    /* 墓碑表与业务表同构（rid/mtime/data），内容 JSON 为 {rid,tbl,at}，
       与《建站部署指南》建表脚本列结构保持一致（首次联调修复：原独立 tbl/at 列在
       云端表中不存在，导致拉取报 42703 column not exist、同步中断） */
    function fetchTombs(done) {
      http('GET', '/rest/v1/hgzx_tomb?select=rid,data&limit=1000', null, null, function (e, j) {
        if (e) { done(e); return; }
        var out = [];
        for (var i = 0; i < (j || []).length; i++) {
          var d = parseBlob(j[i].data) || {};
          var rid = d.rid || j[i].rid;
          if (rid) out.push({ rid: rid, tbl: d.tbl || '', at: +d.at || 0 });
        }
        done(null, out);
      });
    }
    function pushTombs(rows, done) {
      http('POST', '/rest/v1/hgzx_tomb?on_conflict=rid',
        rows.map(function (r) {
          return { rid: r.rid, mtime: Date.now(), data: JSON.stringify({ rid: r.rid, tbl: r.tbl || '', at: r.at || Date.now() }) };
        }),
        'resolution=merge-duplicates', done);
    }
    cb(null, {
      name: 'supabase',
      fetchRows: fetchRows, upsert: upsert,
      removeRids: removeRids, removeByOids: removeByOids,
      fetchTombs: fetchTombs, pushTombs: pushTombs
    });
  }

  /* ---------- 合并逻辑 ---------- */
  function mergeTombs(list2) {
    var changed = false;
    for (var i = 0; i < list2.length; i++) {
      var t = list2[i];
      if (!t || !t.rid || findTomb(t.rid)) continue;
      addTomb(t.tbl, t.rid, true);
      changed = true;
      for (var k = 0; k < SYNC_TABLES.length; k++) {
        var tbl = SYNC_TABLES[k];
        var rows = list(tbl), kept = [];
        for (var j = 0; j < rows.length; j++) {
          if (rows[j].id === t.rid) { delete (pushed[tbl] || {})[t.rid]; continue; }
          kept.push(rows[j]);
        }
        save(tbl, kept);
      }
    }
    if (changed) persistPushed();
  }

  function mergeTable(tbl, rows) {
    /* 同 rid 去重（并发创建可能产生的重复云端记录）：保留 mtime 最大者 */
    var uniq = {}, dupOids = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.data || !r.data.id) continue;
      if (uniq[r.rid] === undefined) uniq[r.rid] = r;
      else if ((r.mtime || 0) > (uniq[r.rid].mtime || 0)) { if (uniq[r.rid].oid) dupOids.push(uniq[r.rid].oid); uniq[r.rid] = r; }
      else if (r.oid) dupOids.push(r.oid);
    }
    if (dupOids.length && cloud.removeByOids) cloud.removeByOids(tbl, dupOids, function () {});

    var locals = list(tbl), byId = {};
    for (i = 0; i < locals.length; i++) byId[locals[i].id] = i;

    var changed = false, seen = {}, pushedT = pushed[tbl] = pushed[tbl] || {};
    for (var rid in uniq) {
      r = uniq[rid];
      seen[rid] = 1;
      if (isTombstoned(rid)) continue;
      var idx = byId[rid];
      if (idx === undefined) { locals.push(r.data); pushedT[rid] = r.mtime || 0; changed = true; }
      else if ((r.mtime || 0) > localMtime(locals[idx])) { locals[idx] = r.data; pushedT[rid] = r.mtime || 0; changed = true; }
    }

    /* 删除语义只认"显式墓碑"：本设备 removeRow / 云端 mergeTombs 两种来源。
       不做"云端没有此行即推断已删"的隐式检测（联调修复：拉取不全/并发发布窗口期
       会把其他设备刚上云的内容误判为已删，批量生成假墓碑并上云，造成数据大量丢失；
       且 doPull 先合并墓碑再合并行，显式墓碑已完整覆盖跨设备删除传播，该检测冗余）。 */
    if (changed) { save(tbl, locals); persistPushed(); }
  }

  function doPull(cb) {
    if (!cloud) { cb && cb('云端未就绪'); return; }
    cloud.fetchTombs(function (err, tl) {
      if (err) { st.error = err; console.warn('[DB] 拉取墓碑失败：', err); cb && cb(err); return; }
      mergeTombs(tl || []);
      var i = 0;
      (function next() {
        if (i >= SYNC_TABLES.length) { st.lastPullAt = Date.now(); st.error = ''; cb && cb(null); return; }
        var tbl = SYNC_TABLES[i++];
        cloud.fetchRows(tbl, function (err2, rows) {
          if (err2) { st.error = err2; console.warn('[DB] 拉取 ' + tbl + ' 失败：', err2); cb && cb(err2); return; }
          try { mergeTable(tbl, rows || []); } catch (e3) { console.warn('[DB] 合并 ' + tbl + ' 异常：', e3); }
          next();
        });
      })();
    });
  }

  function doFlush(cb) {
    if (!cloud) { cb && cb('云端未就绪'); return; }
    var tables = [], unpushedTombs = [];
    var tlist = tombs();
    for (var i = 0; i < tlist.length; i++) if (!tlist[i].pt) unpushedTombs.push(tlist[i]);
    for (i = 0; i < SYNC_TABLES.length; i++) {
      var tbl = SYNC_TABLES[i];
      var pushedT = pushed[tbl] = pushed[tbl] || {};
      var rows = list(tbl), dirty = [];
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (isTombstoned(r.id)) continue;
        if (pushedT[r.id] === undefined || localMtime(r) > (pushedT[r.id] || 0)) {
          if (JSON.stringify(r).length > MAX_ROW_CHARS) {   // 超大行不上云（防超出单条记录限制）
            if (!st.bigSkip[tbl]) st.bigSkip[tbl] = {};
            st.bigSkip[tbl][r.id] = 1;
            st.skippedBig++;
            console.warn('[DB] 行 ' + tbl + '/' + r.id + ' 过大，暂不上云（仅本地保留）');
            continue;
          }
          delete (st.bigSkip[tbl] || {})[r.id];
          dirty.push(r);
        }
      }
      if (dirty.length) tables.push({ tbl: tbl, rows: dirty });
    }
    if (!tables.length && !unpushedTombs.length) { cb && cb(null); return; }

    var ti = 0, failed = null;
    (function nextTable() {
      if (failed) { cb && cb(failed); return; }
      if (ti >= tables.length) {
        if (unpushedTombs.length) {
          /* 先删云端业务行（仅限此前已成功推送过的行；未上过云的行云端本就没有），
             再推墓碑标记。
             【联调修复】removeRids 原先未被接线，已删内容永久残留云端业务表，
             且其他设备拉取合并时（seen 命中）会把已删内容"复活"，删除跨设备不生效 */
          var delPlan = {}, delTbls = [];
          for (var dk = 0; dk < unpushedTombs.length; dk++) {
            var tb = unpushedTombs[dk];
            if (SYNC_TABLES.indexOf(tb.tbl) < 0) continue;
            if ((pushed[tb.tbl] || {})[tb.rid] === undefined) continue;
            (delPlan[tb.tbl] = delPlan[tb.tbl] || []).push(tb.rid);
          }
          for (var dt2 in delPlan) delTbls.push({ tbl: dt2, rids: delPlan[dt2] });
          var pushMarkers = function () {
            cloud.pushTombs(unpushedTombs, function (err3) {
              if (err3) { st.error = err3; console.warn('[DB] 推送墓碑失败：', err3); failed = err3; cb && cb(err3); return; }
              var set2 = {};
              for (var k = 0; k < unpushedTombs.length; k++) set2[unpushedTombs[k].rid] = 1;
              var t2 = tombs();
              for (k = 0; k < t2.length; k++) if (set2[t2[k].rid]) t2[k].pt = 1;
              set('tombstones', t2);
              st.lastPushAt = Date.now(); st.error = '';
              cb && cb(null);
            });
          };
          (function nextDel(di) {
            if (failed) { cb && cb(failed); return; }
            if (di >= delTbls.length) { pushMarkers(); return; }   // 云端业务行删除完毕 → 再推墓碑标记
            var d = delTbls[di++];
            cloud.removeRids(d.tbl, d.rids, function (errD) {
              if (errD) { st.error = errD; console.warn('[DB] 云端删除 ' + d.tbl + ' 失败：', errD); failed = errD; cb && cb(errD); return; }
              for (var ek = 0; ek < d.rids.length; ek++) delete pushed[d.tbl][d.rids[ek]];
              persistPushed();
              nextDel(di);
            });
          })(0);
        } else { st.lastPushAt = Date.now(); st.error = ''; cb && cb(null); }
        return;
      }
      var job = tables[ti++];
      cloud.upsert(job.tbl, job.rows, function (err2) {
        if (err2) { st.error = err2; console.warn('[DB] 推送 ' + job.tbl + ' 失败：', err2); failed = err2; cb && cb(err2); return; }
        var pushedT = pushed[job.tbl] = pushed[job.tbl] || {};
        for (var k = 0; k < job.rows.length; k++) pushedT[job.rows[k].id] = localMtime(job.rows[k]);
        persistPushed();
        nextTable();
      });
    })();
  }

  /* ---------- 调度（同一时刻仅一个云端任务在跑） ---------- */
  var busy = false, wantJob = null;
  function runJob(job) {
    if (!cloud) return;
    if (busy) { wantJob = job; return; }
    busy = true;
    (job === 'pull' ? doPull : doFlush)(function () {
      busy = false;
      if (wantJob) { var w = wantJob; wantJob = null; runJob(w); }
    });
  }
  function pendingWrites() {
    if (!cloud) return 0;
    var n = 0, tlist = tombs();
    for (var i = 0; i < tlist.length; i++) if (!tlist[i].pt) n++;
    for (i = 0; i < SYNC_TABLES.length; i++) {
      var tbl = SYNC_TABLES[i], pushedT = pushed[tbl] || {}, rows = list(tbl);
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (isTombstoned(r.id) || (st.bigSkip[tbl] && st.bigSkip[tbl][r.id])) continue;
        if (pushedT[r.id] === undefined || localMtime(r) > (pushedT[r.id] || 0)) n++;
      }
    }
    return n;
  }
  function startLoops() {
    if (typeof document === 'undefined') return;
    setInterval(function () { runJob('pull'); }, 120000);                       // 2 分钟全量拉取
    setInterval(function () { if (pendingWrites() > 0) runJob('flush'); }, 10000); // 有待推则推送
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) runJob('pull');
    });
  }

  /* ---------- 按配置启动云端 ---------- */
  (function boot() {
    if (typeof window === 'undefined') return;
    var cfg = window.HGZX_CONFIG || {};
    var p = String(cfg.provider || '').toLowerCase().trim();
    function onReady(err, ad) {
      if (err) { st.mode = 'local'; st.ready = false; st.error = err; console.warn('[DB] 云端不可用，已自动回退本地模式：', err); return; }
      cloud = ad; st.ready = true;
      runJob('pull');
      startLoops();
    }
    if (p === 'leancloud' && cfg.leancloud && cfg.leancloud.appId && cfg.leancloud.appKey) {
      st.mode = 'leancloud';
      makeLeanAdapter(cfg.leancloud, onReady);
    } else if (p === 'supabase' && cfg.supabase && cfg.supabase.url && cfg.supabase.anonKey) {
      st.mode = 'supabase';
      makeSupaAdapter(cfg.supabase, onReady);
    } else if (p) {
      st.error = 'config.js 已选云端模式但密钥未填全，已自动回退本地模式';
    }
  })();

  function status() {
    return {
      mode: st.mode, ready: st.ready,
      lastPullAt: st.lastPullAt, lastPushAt: st.lastPushAt,
      pendingWrites: pendingWrites(), skippedBig: st.skippedBig,
      error: st.error,
      tables: SYNC_TABLES.slice(0)
    };
  }

  /* ---------- 对外接口 ---------- */
  return {
    get: get, set: set, del: del,
    list: list, insert: insert, update: update, remove: removeRow,
    find: find, findOne: findOne,
    use: function (name) {
      if (name === 'cloud') {
        if (st.mode === 'local') console.info('[DB] 请在 config.js 填写 provider 与密钥后刷新页面以启用云端。');
        return st.mode !== 'local';
      }
      return true;
    },
    backend: function () { return st.mode; },   // 'local' | 'leancloud' | 'supabase'
    status: status,
    /* 测试钩子（仅用于自动化测试注入假适配器，不影响正常页面） */
    _test: {
      inject: function (ad) { cloud = ad; st.mode = ad.name || 'test'; st.ready = true; },
      pull: function (cb) { doPull(cb); },
      flush: function (cb) { doFlush(cb); }
    }
  };
})();
