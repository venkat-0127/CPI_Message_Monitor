sap.ui.define([], function () {
  "use strict";

  var CAP = "/odata/v4/monitor";
  var oSummary  = new sap.ui.model.json.JSONModel({ TOTAL:0,COMPLETED:0,FAILED:0,PROCESSING:0,RETRY:0 });
  var oMessages = new sap.ui.model.json.JSONModel([]);
  var oErrors   = new sap.ui.model.json.JSONModel([]);

  function statusState(s) {
    return { COMPLETED:"Success",FAILED:"Error",PROCESSING:"Warning",RETRY:"Warning" }[s]||"None";
  }

  function fmtDt(v) {
    if (!v) return "-";
    var m = v.match(/\/Date\((\d+)\)\//);
    if (m) return new Date(parseInt(m[1])).toLocaleString();
    try { return new Date(v).toLocaleString(); } catch(e) { return v; }
  }

  // ── Helper: unwrap OData string-encoded JSON returned by CAP ──────────────
  // CAP wraps a JSON.stringify() return value as { value: "...string..." }
  function unwrap(d) {
    if (d && typeof d.value === "string") {
      try { return JSON.parse(d.value); } catch(e) {}
    }
    if (typeof d === "string") {
      try { return JSON.parse(d); } catch(e) {}
    }
    return d;
  }

  function loadSummary() {
    // Summary → pie chart
    fetch(CAP+"/getSummary()")
      .then(function(r){ return r.json(); })
      .then(function(d){
        var raw = unwrap(d);
        oSummary.setData(raw);
        drawPie(raw);
      })
      .catch(function(e){ console.error("Summary:",e); });

    // Hourly stats → real line chart
    fetch(CAP+"/getHourlyStats()")
      .then(function(r){ return r.json(); })
      .then(function(d){
        var pts = unwrap(d);
        drawLine(Array.isArray(pts) ? pts : []);
      })
      .catch(function(e){
        console.error("HourlyStats:",e);
        drawLine([]); // fallback to flat line
      });
  }

  function loadMessages() {
    var sf = sap.ui.getCore().byId("statusFilter");
    var ff = sap.ui.getCore().byId("flowFilter");
    var status = sf ? sf.getSelectedKey() : "ALL";
    var flow   = ff ? ff.getSelectedKey() : "";
    var url = CAP+"/getMessages(status='"+status+"',flow="+(flow?"'"+flow+"'":"null")+",top=100)";

    // FIX: was "fetch(url).then ? fetch(url) : fetch(url)" — called fetch twice,
    //      second call had no .then chain. Now a single clean chain.
    fetch(url)
      .then(function(r){ return r.json(); })
      .then(function(d){
        var raw = unwrap(d);
        var items = Array.isArray(raw) ? raw
                  : (raw && raw.MessageGuid) ? [raw]
                  : [];
        oMessages.setData(items);
        oErrors.setData(items.filter(function(m){ return m.Status==="FAILED"||m.Status==="RETRY"; }));
        sap.m.MessageToast.show("Loaded "+items.length+" messages");
      })
      .catch(function(e){ console.error("Messages:",e); });
  }

  function loadFlows() {
    fetch(CAP+"/getFlows()")
      .then(function(r){ return r.json(); })
      .then(function(d){
        var flows = d.value||d;
        var sel = sap.ui.getCore().byId("flowFilter");
        if (!sel) return;
        while (sel.getItems().length > 1) sel.removeItem(1);
        flows.forEach(function(f){ sel.addItem(new sap.ui.core.Item({ key:f.name,text:f.name })); });
      }).catch(function(e){ console.error("Flows:",e); });
  }

  function drawPie(s) {
    setTimeout(function(){
      var c = document.getElementById("pieCanvas");
      if (!c) return;
      // Fill the container width, keep fixed height
      var container = c.parentElement;
      var w = container ? Math.max(container.offsetWidth - 24, 160) : 260;
      var h = 220;
      c.width  = w;
      c.height = h;
      var ctx = c.getContext("2d");
      var data = [
        { v:s.COMPLETED||0,  color:"#27ae60" },
        { v:s.FAILED||0,     color:"#e74c3c" },
        { v:s.PROCESSING||0, color:"#f39c12" },
        { v:s.RETRY||0,      color:"#3498db" }
      ];
      var total = data.reduce(function(a,d){ return a+d.v; },0);
      ctx.clearRect(0,0,w,h);
      if (total===0) {
        ctx.fillStyle="#999"; ctx.font="13px Arial"; ctx.textAlign="center";
        ctx.fillText("No data",w/2,h/2); return;
      }
      var cx=w/2, cy=h/2, r=Math.min(cx,cy)-10, a=-Math.PI/2;
      data.forEach(function(d){
        if (d.v===0) return;
        var sl=(d.v/total)*2*Math.PI;
        ctx.beginPath(); ctx.moveTo(cx,cy);
        ctx.arc(cx,cy,r,a,a+sl); ctx.closePath();
        ctx.fillStyle=d.color; ctx.fill();
        ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
        a+=sl;
      });
      ctx.beginPath(); ctx.arc(cx,cy,r*0.5,0,2*Math.PI);
      ctx.fillStyle="#fff"; ctx.fill();
    }, 600);
  }

  // ── drawLine: accepts real hourly data from getHourlyStats ────────────────
  function drawLine(hourlyData) {
    setTimeout(function(){
      var c = document.getElementById("lineCanvas");
      if (!c) return;
      c.width  = c.parentElement ? Math.max(c.parentElement.offsetWidth - 24, 200) : 560;
      c.height = 220;
      var ctx=c.getContext("2d"), W=c.width, H=c.height;
      var pad={top:15,right:15,bottom:25,left:40};
      var iW=W-pad.left-pad.right, iH=H-pad.top-pad.bottom;

      // Build pts from real data if available, else 24 zero buckets
      var pts;
      if (hourlyData && hourlyData.length) {
        var allPts = hourlyData.map(function(b){ return { lbl: b.label, v: b.count }; });
        // Trim leading zero buckets so spike is visible — keep 1 zero before first non-zero for context
        var firstNonZero = -1;
        for (var k=0; k<allPts.length; k++) { if (allPts[k].v > 0) { firstNonZero = k; break; } }
        if (firstNonZero > 0) {
          pts = allPts.slice(Math.max(0, firstNonZero - 1));
        } else {
          pts = allPts;
        }
      } else {
        pts = [];
        for (var j=23;j>=0;j--) {
          pts.push({ lbl: new Date(Date.now()-j*3600000).getHours()+":00", v: 0 });
        }
      }

      var maxV = Math.max.apply(null, pts.map(function(p){ return p.v; })) || 1;
      var stepX = iW / (pts.length - 1);
      ctx.clearRect(0,0,W,H);

      // Grid lines + Y labels
      for (var g=0;g<=4;g++) {
        var gy = pad.top + iH - (g/4)*iH;
        ctx.strokeStyle="#eee"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(pad.left,gy); ctx.lineTo(pad.left+iW,gy); ctx.stroke();
        ctx.fillStyle="#aaa"; ctx.font="9px Arial"; ctx.textAlign="right";
        ctx.fillText(Math.round((g/4)*maxV), pad.left-4, gy+3);
      }

      // Line path
      ctx.beginPath();
      pts.forEach(function(p,i){
        var x = pad.left + i*stepX;
        var y = pad.top + iH - (p.v/maxV)*iH;
        if (i===0) { ctx.moveTo(x,y); } else { ctx.lineTo(x,y); }
      });
      ctx.strokeStyle="#3b82f6"; ctx.lineWidth=2; ctx.stroke();

      // Fill under line
      var lx = pad.left + (pts.length-1)*stepX;
      ctx.lineTo(lx, pad.top+iH); ctx.lineTo(pad.left, pad.top+iH);
      ctx.closePath(); ctx.fillStyle="rgba(59,130,246,0.1)"; ctx.fill();

      // X-axis labels
      ctx.fillStyle="#888"; ctx.font="9px Arial"; ctx.textAlign="center";
      pts.forEach(function(p,i){ if (i%6===0) ctx.fillText(p.lbl, pad.left+i*stepX, H-5); });

      // Dots on non-zero data points
      pts.forEach(function(p,i){
        if (p.v === 0) return;
        var x = pad.left + i*stepX;
        var y = pad.top + iH - (p.v/maxV)*iH;
        ctx.beginPath(); ctx.arc(x,y,3,0,2*Math.PI);
        ctx.fillStyle="#3b82f6"; ctx.fill();
      });
    }, 600);
  }

  function showDetail(msg) {
    var dlg = new sap.m.Dialog({
      title:"Details — "+(msg.IntegrationFlowName||""),
      contentWidth:"480px",
      content:[new sap.m.VBox({ items:[
        new sap.m.Label({ text:"Message GUID" }),
        new sap.m.Text({ text:msg.MessageGuid||"-" }),
        new sap.m.Label({ text:"Status" }),
        new sap.m.ObjectStatus({ text:msg.Status,state:statusState(msg.Status) }),
        new sap.m.Label({ text:"Start" }),
        new sap.m.Text({ text:fmtDt(msg.LogStart) }),
        new sap.m.Label({ text:"End" }),
        new sap.m.Text({ text:fmtDt(msg.LogEnd) }),
        new sap.m.Label({ text:"Sender → Receiver" }),
        new sap.m.Text({ text:(msg.Sender||"-")+" → "+(msg.Receiver||"-") })
      ]})],
      beginButton:new sap.m.Button({
        text:"Load Error Info",type:"Emphasized",
        press:function(){
          fetch(CAP+"/getErrorInfo(guid='"+msg.MessageGuid+"')")
            .then(function(r){ return r.json(); })
            .then(function(e){
              dlg.addContent(new sap.m.MessageStrip({
                text:e.ErrorMessage||"No error details",type:"Error",showIcon:true
              }));
            });
        }
      }),
      endButton:new sap.m.Button({
        text:"Close",press:function(){ dlg.close(); dlg.destroy(); }
      })
    });
    dlg.open();
  }

  var oPage = new sap.m.Page({
    showHeader:false,
    customHeader:new sap.m.Bar({
      design:"Header",
      contentLeft:[new sap.m.Title({ text:"SAP CPI Message Monitor",level:"H3" })],
      contentRight:[
        new sap.m.Button({
          icon:"sap-icon://refresh",text:"Refresh",type:"Emphasized",
          press:function(){ loadSummary(); loadMessages(); sap.m.MessageToast.show("Refreshing..."); }
        }),
        new sap.m.Avatar({ initials:"JD",displaySize:"XS" }).addStyleClass("sapUiTinyMarginBegin")
      ]
    }),
    content:[

      // ── KPI Tiles ─────────────────────────────────────────────────────────
      new sap.m.HBox({ wrap:"Wrap",items:[
        new sap.m.GenericTile({ header:"Total Messages",tileContent:[new sap.m.TileContent({ content:new sap.m.NumericContent({ value:"{summary>/TOTAL}",valueColor:"Good",withMargin:false }) })] }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom"),
        new sap.m.GenericTile({ header:"Completed",tileContent:[new sap.m.TileContent({ content:new sap.m.NumericContent({ value:"{summary>/COMPLETED}",valueColor:"Good",withMargin:false }) })] }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom"),
        new sap.m.GenericTile({ header:"Failed",tileContent:[new sap.m.TileContent({ content:new sap.m.NumericContent({ value:"{summary>/FAILED}",valueColor:"Critical",withMargin:false }) })] }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom"),
        new sap.m.GenericTile({ header:"Processing",tileContent:[new sap.m.TileContent({ content:new sap.m.NumericContent({ value:"{summary>/PROCESSING}",valueColor:"Neutral",withMargin:false }) })] }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom"),
        new sap.m.GenericTile({ header:"Retry",tileContent:[new sap.m.TileContent({ content:new sap.m.NumericContent({ value:"{summary>/RETRY}",valueColor:"Critical",withMargin:false }) })] }).addStyleClass("sapUiTinyMarginEnd sapUiTinyMarginBottom")
      ]}).addStyleClass("sapUiSmallMargin"),

      // ── Charts Row (plain HTML for true flex/responsive layout) ───────────
      new sap.ui.core.HTML({ content:
        '<div style="display:flex;gap:16px;padding:0 16px 16px 16px;box-sizing:border-box;width:100%">' +
          // Line chart panel
          '<div style="flex:1;min-width:0;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px;box-sizing:border-box">' +
            '<div style="font-size:14px;font-weight:600;color:#32363a;margin-bottom:8px">Message Volume (Last 24 Hours)</div>' +
            '<canvas id="lineCanvas" style="display:block;width:100%"></canvas>' +
          '</div>' +
          // Pie chart panel
          '<div style="flex:1;min-width:0;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px;box-sizing:border-box">' +
            '<div style="font-size:14px;font-weight:600;color:#32363a;margin-bottom:8px">Status Overview</div>' +
            '<div style="text-align:center">' +
              '<canvas id="pieCanvas" style="display:block;width:100%"></canvas>' +
              '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding:6px 0;font-size:12px">' +
                '<span><i style="display:inline-block;width:10px;height:10px;background:#27ae60;border-radius:50%;margin-right:3px"></i>Completed</span>' +
                '<span><i style="display:inline-block;width:10px;height:10px;background:#e74c3c;border-radius:50%;margin-right:3px"></i>Failed</span>' +
                '<span><i style="display:inline-block;width:10px;height:10px;background:#f39c12;border-radius:50%;margin-right:3px"></i>Processing</span>' +
                '<span><i style="display:inline-block;width:10px;height:10px;background:#3498db;border-radius:50%;margin-right:3px"></i>Retry</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      }),

      // ── Filter Toolbar ────────────────────────────────────────────────────
      new sap.m.Toolbar({ content:[
        new sap.m.Label({ text:"Status:" }),
        new sap.m.Select({ id:"statusFilter",width:"130px",
          change:function(){ loadMessages(); },
          items:[
            new sap.ui.core.Item({ key:"ALL",text:"All" }),
            new sap.ui.core.Item({ key:"COMPLETED",text:"Completed" }),
            new sap.ui.core.Item({ key:"FAILED",text:"Failed" }),
            new sap.ui.core.Item({ key:"PROCESSING",text:"Processing" })
          ]
        }),
        new sap.m.ToolbarSpacer(),
        new sap.m.Label({ text:"Flow:" }),
        new sap.m.Select({ id:"flowFilter",width:"180px",
          change:function(){ loadMessages(); },
          items:[new sap.ui.core.Item({ key:"",text:"All Flows" })]
        }),
        new sap.m.ToolbarSpacer(),
        new sap.m.SearchField({
          width:"200px",placeholder:"Search Message ID...",
          search:function(e){
            var q=e.getParameter("query");
            var b=sap.ui.getCore().byId("msgTable").getBinding("items");
            if (!q) { b.filter([]); return; }
            b.filter([new sap.ui.model.Filter("MessageGuid",sap.ui.model.FilterOperator.Contains,q)]);
          }
        })
      ]}).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd"),

      // ── Recent Errors ─────────────────────────────────────────────────────
      new sap.m.Panel({
        headerText:"Recent Error Messages",expandable:true,expanded:true,
        content:[new sap.m.Table({
          id:"errTable",noDataText:"No errors — all good!",
          columns:[
            new sap.m.Column({ width:"22%",header:new sap.m.Text({ text:"Integration Flow" }) }),
            new sap.m.Column({ width:"33%",header:new sap.m.Text({ text:"Error Message" }) }),
            new sap.m.Column({ width:"15%",header:new sap.m.Text({ text:"Status" }) }),
            new sap.m.Column({ width:"15%",header:new sap.m.Text({ text:"Start Time" }) }),
            new sap.m.Column({ width:"15%",header:new sap.m.Text({ text:"Action" }) })
          ],
          items:{ path:"errors>/",template:new sap.m.ColumnListItem({ cells:[
            new sap.m.Text({ text:"{errors>IntegrationFlowName}" }),
            new sap.m.Text({ text:"{errors>ErrorMessage}" }),
            new sap.m.ObjectStatus({ text:"{errors>Status}",state:{ path:"errors>Status",formatter:function(s){ return statusState(s); } } }),
            new sap.m.Text({ text:{ path:"errors>LogStart",formatter:function(v){ return fmtDt(v); } } }),
            new sap.m.Button({ text:"View Details",type:"Emphasized",press:function(e){ showDetail(e.getSource().getBindingContext("errors").getObject()); } })
          ]})}
        })]
      }).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd sapUiSmallMarginBottom"),

      // ── Message Processing Logs ───────────────────────────────────────────
      new sap.m.Table({
        id:"msgTable",growing:true,growingThreshold:20,noDataText:"No messages found",
        headerToolbar:new sap.m.Toolbar({ content:[
          new sap.m.Title({ text:"Message Processing Logs",level:"H4" }),
          new sap.m.ToolbarSpacer(),
          new sap.m.Button({
            icon:"sap-icon://excel-attachment",text:"Export CSV",
            press:function(){
              var data=oMessages.getData();
              var keys=["MessageGuid","IntegrationFlowName","Status","LogStart","LogEnd","Sender","Receiver"];
              var csv=[keys.join(",")].concat(data.map(function(r){
                return keys.map(function(k){ return '"'+(r[k]||"")+'"'; }).join(",");
              })).join("\n");
              var a=document.createElement("a");
              a.href=URL.createObjectURL(new Blob([csv],{ type:"text/csv" }));
              a.download="cpi_messages.csv"; a.click();
            }
          })
        ]}),
        columns:[
          new sap.m.Column({ width:"15%",header:new sap.m.Text({ text:"Message ID" }) }),
          new sap.m.Column({ width:"17%",header:new sap.m.Text({ text:"Integration Flow" }) }),
          new sap.m.Column({ width:"10%",header:new sap.m.Text({ text:"Status" }) }),
          new sap.m.Column({ width:"12%",header:new sap.m.Text({ text:"Start Time" }) }),
          new sap.m.Column({ width:"12%",header:new sap.m.Text({ text:"End Time" }) }),
          new sap.m.Column({ width:"11%",header:new sap.m.Text({ text:"Sender" }) }),
          new sap.m.Column({ width:"11%",header:new sap.m.Text({ text:"Receiver" }) }),
          new sap.m.Column({ width:"12%",header:new sap.m.Text({ text:"Actions" }) })
        ],
        items:{ path:"messages>/",template:new sap.m.ColumnListItem({
          type:"Navigation",
          press:function(e){ showDetail(e.getSource().getBindingContext("messages").getObject()); },
          cells:[
            new sap.m.Link({ text:"{messages>MessageGuid}",
              press:function(e){
                var msg=e.getSource().getBindingContext("messages").getObject();
                if (msg.AlternateWebLink) sap.m.URLHelper.redirect(msg.AlternateWebLink,true);
              }}),
            new sap.m.Text({ text:"{messages>IntegrationFlowName}" }),
            new sap.m.ObjectStatus({ text:"{messages>Status}",state:{ path:"messages>Status",formatter:function(s){ return statusState(s); } } }),
            new sap.m.Text({ text:{ path:"messages>LogStart",formatter:function(v){ return fmtDt(v); } } }),
            new sap.m.Text({ text:{ path:"messages>LogEnd",  formatter:function(v){ return fmtDt(v); } } }),
            new sap.m.Text({ text:"{messages>Sender}" }),
            new sap.m.Text({ text:"{messages>Receiver}" }),
            new sap.m.Button({ text:"View Details",type:"Emphasized",
              press:function(e){ showDetail(e.getSource().getBindingContext("messages").getObject()); } })
          ]
        })}
      }).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd sapUiSmallMarginBottom")
    ]
  });

  oPage.setModel(oSummary,  "summary");
  oPage.setModel(oMessages, "messages");
  oPage.setModel(oErrors,   "errors");

  new sap.m.App({ pages:[oPage] }).placeAt("content");

  setTimeout(function(){
    loadSummary(); loadMessages(); loadFlows();
    setInterval(function(){ loadSummary(); loadMessages(); }, 60000);
  }, 800);

  console.log("✅ CPI Dashboard Ready");
});