// Shanghai weather cell. One fetch lands observe + 8-day forecast; the js
// step parses it and emits `weather.updated` so downstream `on:` flows can
// chain off a fresh reading instead of polling.
function readText(got) {
  if (typeof got === "string") return got;
  if (got && typeof got.text === "string") return got.text;
  if (got && typeof got.value === "string") return got.value;
  return (got === null || got === undefined) ? "" : ("" + got);
}
return {
  render: function(args) {
    var raw = readText(ct.tool.call("fs.read", { path: "weather.json" }));
    var w = (JSON.parse(raw).data || {});
    var obs = w.observe || {};
    var f = w.forecast_24h || {};
    var days = Object.keys(f).sort().slice(1, 9).map(function(k) { return f[k]; });
    var sparkline = days.map(function(d) { return parseFloat(d.max_degree); })
      .filter(function(v) { return isFinite(v); });
    var newsItems = days.slice(0, 5).map(function(d) {
      return (d.time || "").slice(5) + " · " + d.day_weather + " " + d.min_degree + "~" + d.max_degree + "°C";
    });
    return {
      title: "天气预报",
      summary: "上海 " + (obs.weather || "?") + " " + (obs.degree || "?") + "°C · " +
        (obs.wind_direction_name || "") + (obs.wind_power || ""),
      extra: "湿度 " + (obs.humidity || "?") + "% · 气压 " + (obs.pressure || "?") + "hPa",
      sparkline: sparkline,
      news: newsItems,
      signal: "weather.updated",
      plotly: {
        data: [
          {
            type: "scatter",
            mode: "lines+markers",
            name: "最高",
            x: days.map(function(d) { return (d.time || "").slice(5); }),
            y: days.map(function(d) { return parseFloat(d.max_degree); })
          },
          {
            type: "scatter",
            mode: "lines+markers",
            name: "最低",
            x: days.map(function(d) { return (d.time || "").slice(5); }),
            y: days.map(function(d) { return parseFloat(d.min_degree); })
          }
        ]
      }
    };
  }
};
