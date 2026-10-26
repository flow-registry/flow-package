// SPCX cell renderer. The two net.fetch steps land the payloads in the
// workspace; this step parses them into the structured output the Views
// cell and detail page project. Defensive on every field: a half-broken
// response degrades to "?" text, never a thrown step.
function readText(got) {
  if (typeof got === "string") return got;
  if (got && typeof got.text === "string") return got.text;
  if (got && typeof got.value === "string") return got.value;
  return (got === null || got === undefined) ? "" : ("" + got);
}
function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
return {
  render: function(args) {
    var kRaw = readText(ct.tool.call("fs.read", { path: "spcx_kline.json" }));
    var kline = (JSON.parse(kRaw).data || {})["usSPCX.OQ"] || {};
    var days = kline.qfqday || kline.day || [];
    var qt = (kline.qt || {})["usSPCX.OQ"] || [];
    var lastDay = days.length ? days[days.length - 1] : null;
    var close = num(qt[3]) || (lastDay ? num(lastDay[2]) : null);
    var chgPct = num(qt[32]);
    var chgText = chgPct == null ? "" :
      " (" + (chgPct >= 0 ? "+" : "") + chgPct.toFixed(2) + "%)";
    // qt[67] is the after-hours quote; qt[9] is a bid, never a fallback
    // for it — pre-market or closed sessions leave it empty.
    var afterPrice = num(qt[67]);
    var extra;
    if (afterPrice != null && close != null && close !== 0) {
      var diff = (afterPrice - close) / close * 100;
      extra = "盘后 $" + afterPrice + " (" + (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%)";
    } else {
      extra = "开 $" + (num(qt[5]) || "?") +
        " 高 $" + (num(qt[33]) || "?") +
        " 低 $" + (num(qt[34]) || "?");
    }
    var sparkline = days
      .map(function(d) { return num(d[2]); })
      .filter(function(v) { return v != null; });
    // News is a separate fetch: a bad payload must not take the
    // already-parsed quote down with it.
    var newsItems = [];
    try {
      var nRaw = readText(ct.tool.call("fs.read", { path: "spcx_news.json" }));
      newsItems = ((JSON.parse(nRaw).data || {}).data || []).slice(0, 5).map(function(n) {
        return (n.time || "").slice(5, 16) + " · " + n.title;
      });
    } catch (e) {}
    return {
      title: "SPCX · " + (qt[1] || "SpaceX"),
      summary: "收 $" + (close == null ? "?" : close) + chgText,
      extra: extra,
      sparkline: sparkline,
      news: newsItems,
      plotly: {
        data: [{
          type: "scatter",
          mode: "lines",
          name: "收盘",
          x: days.map(function(d) { return d[0]; }),
          y: sparkline
        }]
      }
    };
  }
};
