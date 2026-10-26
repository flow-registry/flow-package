// Proxy-subscription importer. Fetch the subscription, parse share links
// (vless/trojan/vmess/hy2/anytls) or a Clash `proxies:` YAML section, then
// ask the host to install the nodes — output.installNodes is the intent,
// settings is the host's. The URL comes from the settings field, stored in
// storage.kv under proxy.subscription.url; an unreachable URL falls back to
// the two embedded sample links so the path demos offline too.
function b64(s) {
  var t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "", bits = 0, acc = 0;
  s = s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  for (var i = 0; i < s.length; i++) {
    var v = t.indexOf(s.charAt(i)); if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 255); }
  }
  return out;
}
function qp(q) {
  var m = {};
  (q || "").split("&").forEach(function(p) {
    var i = p.indexOf("="); if (i < 0) return;
    try { m[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (e) { m[p.slice(0, i)] = p.slice(i + 1); }
  });
  return m;
}
function uriNode(protocol, line) {
  var hash = line.indexOf("#");
  var name = hash >= 0 ? decodeURIComponent(line.slice(hash + 1)) : "";
  var body = line.slice(line.indexOf("://") + 3, hash >= 0 ? hash : undefined);
  var qi = body.indexOf("?");
  var auth = qi >= 0 ? body.slice(0, qi) : body;
  var q = qi >= 0 ? qp(body.slice(qi + 1)) : {};
  var at = auth.lastIndexOf("@");
  var cred = at >= 0 ? auth.slice(0, at) : "";
  var hp = at >= 0 ? auth.slice(at + 1) : auth;
  var c = hp.lastIndexOf(":");
  var node = {
    protocol: protocol, credential: cred,
    host: hp.slice(0, c), port: hp.slice(c + 1), name: name,
    sni: q.sni || q.peer || "", transport: "TCP"
  };
  if (q.type === "ws") { node.transport = "WS"; node.wsPath = q.path || ""; node.wsHost = q.host || ""; }
  if (q.type === "grpc") { node.transport = "GRPC"; node.grpcService = q.serviceName || ""; }
  if (q.pbk) { node.realityKey = q.pbk; node.realityShortId = q.sid || ""; }
  if (q.flow === "xtls-rprx-vision") node.visionFlow = true;
  if (q["obfs-password"]) node.aux = q["obfs-password"];
  return node;
}
// Clash YAML subscriptions answer a `proxies:` section, not share links — a
// shallow parser for the two shapes entries take: `- {inline}` maps and
// indented `key: value` blocks.
function topSplit(s, sep) {
  var out = [], depth = 0, last = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === sep && depth === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  return out;
}
function inlineMap(s) {
  var m = {};
  var inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  topSplit(inner, ",").forEach(function(pair) {
    var i = pair.indexOf(":"); if (i < 0) return;
    var k = pair.slice(0, i).trim().replace(/^["']|["']$/g, "");
    var v = pair.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k) m[k] = v.charAt(0) === "{" ? inlineMap(v) : v;
  });
  return m;
}
function scalar(v) {
  return (v || "").trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "");
}
function yamlProxies(body) {
  var list = [];
  var inProxies = false, cur = null;
  var stack = []; // [{indent, map}] — tracks nested opts blocks
  function flush() { if (cur) { list.push(cur); cur = null; } stack.length = 0; }
  body.split(/\r?\n/).forEach(function(raw) {
    if (!inProxies) { if (/^proxies\s*:/.test(raw)) inProxies = true; return; }
    if (/^\S/.test(raw)) { flush(); inProxies = false; return; }
    var indent = raw.length - raw.replace(/^\s+/, "").length;
    var item = raw.match(/^\s*-\s*(.*)/);
    if (item) {
      flush(); cur = {}; stack.push({ indent: indent, map: cur });
      var rest = item[1].trim();
      if (rest.charAt(0) === "{") {
        var m = inlineMap(rest);
        for (var k in m) cur[k] = m[k];
      } else {
        var kv = rest.match(/^([^:]+):\s*(.*)/);
        if (kv) cur[kv[1].trim()] = scalar(kv[2]);
      }
      return;
    }
    if (!cur) return;
    var kv2 = raw.match(/^\s+([^:]+):\s*(.*)/);
    if (!kv2) return;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    var parent = stack[stack.length - 1].map;
    var k = kv2[1].trim(), v = scalar(kv2[2]);
    if (v === "") {
      var m2 = {}; parent[k] = m2; stack.push({ indent: indent, map: m2 });
    } else {
      parent[k] = v.charAt(0) === "{" ? inlineMap(v) : v;
    }
  });
  flush();
  return list;
}
function clashNode(p) {
  var type = (p.type || "").toLowerCase();
  var proto = { vless: "VLESS", vmess: "VMESS", trojan: "TROJAN",
    hysteria2: "HYSTERIA2", hy2: "HYSTERIA2", anytls: "ANYTLS" }[type];
  if (!proto) return null;
  var node = {
    protocol: proto, name: p.name || "", host: p.server || "",
    port: String(p.port || ""),
    sni: typeof p.sni === "string" ? p.sni : (p.servername || ""),
    credential: p.uuid || p.password || "", transport: "TCP"
  };
  var net = p.network || "";
  if (net === "ws" || p["ws-opts"]) {
    node.transport = "WS";
    var w = p["ws-opts"] || {};
    node.wsPath = w.path || "";
    var h = w.headers || {};
    node.wsHost = h.Host || h.host || "";
  } else if (net === "grpc" || p["grpc-opts"]) {
    node.transport = "GRPC";
    node.grpcService = (p["grpc-opts"] || {})["grpc-service-name"] || "";
  }
  var r = p["reality-opts"];
  if (r) { node.realityKey = r["public-key"] || ""; node.realityShortId = r["short-id"] || ""; }
  if (p.flow === "xtls-rprx-vision") node.visionFlow = true;
  if (p["obfs-password"]) node.aux = p["obfs-password"];
  return node;
}
var DEMO_LINKS = [
  "vless://2f1c9f8e-aaaa-bbbb-cccc-ddddeeeeffff@node-a.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&pbk=demoPublicKey&sid=ab&type=tcp&flow=xtls-rprx-vision#demo-vless",
  "trojan://demo-pass-1@node-b.example.com:443?sni=cdn.example.com#demo-trojan"
];
return {
  run: function(args) {
    var SUB_URL = "https://example.com/your-subscription";
    try {
      var saved = ct.storage.kv.get("proxy.subscription.url");
      if (typeof saved === "string" && saved.length > 0) SUB_URL = saved;
    } catch (e) {}
    var body = "";
    try {
      ct.tool.call("net.fetch", {
        url: SUB_URL, path: "proxy_sub.txt",
        headers: { "User-Agent": "clash-verge/v2.4.2" }
      });
      body = ct.tool.call("fs.read", { path: "proxy_sub.txt" }).text || "";
    } catch (e) { body = ""; }
    if (body.indexOf("://") < 0 && body.indexOf("proxies") < 0 && body.trim().length > 0) {
      try { body = b64(body.trim()); } catch (e) {}
    }
    var nodes = [];
    if (body.indexOf("proxies") >= 0) {
      yamlProxies(body).forEach(function(p) {
        var n = clashNode(p); if (n && n.host) nodes.push(n);
      });
    } else {
      var lines = (body.indexOf("://") >= 0 ? body : DEMO_LINKS.join("\n")).split(/\r?\n/);
      lines.forEach(function(line) {
        line = line.trim(); if (!line) return;
        try {
          if (line.indexOf("vmess://") === 0) {
            var j = JSON.parse(b64(line.slice(8)));
            nodes.push({
              protocol: "VMESS", name: j.ps || "", host: j.add || "",
              port: String(j.port || ""), credential: j.id || "",
              transport: j.net === "ws" ? "WS" : "TCP",
              wsPath: j.path || "", wsHost: j.host || "", sni: j.sni || ""
            });
          } else if (line.indexOf("vless://") === 0) nodes.push(uriNode("VLESS", line));
          else if (line.indexOf("trojan://") === 0) nodes.push(uriNode("TROJAN", line));
          else if (line.indexOf("anytls://") === 0) nodes.push(uriNode("ANYTLS", line));
          else if (line.indexOf("hysteria2://") === 0 || line.indexOf("hy2://") === 0) {
            nodes.push(uriNode("HYSTERIA2", line));
          }
        } catch (e) {}
      });
    }
    return {
      title: "代理订阅",
      summary: nodes.length + " 个节点已加入设置",
      extra: SUB_URL,
      installNodes: nodes,
      openView: true
    };
  }
};
