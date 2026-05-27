sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
  "use strict";

  var CAP = "/odata/v4/monitor";

  return Controller.extend("com.company.cpimonitor.controller.App", {

    onInit: function () {
      this.getView().setModel(
        new JSONModel({ TOTAL:0, COMPLETED:0, FAILED:0, PROCESSING:0, RETRY:0 }),
        "summary"
      );
      this.getView().setModel(new JSONModel([]), "messages");
      this.getView().setModel(new JSONModel([]), "errors");
      console.log("✅ CPI Dashboard Loaded Successfully");
      this._loadAll();
      this._timer = setInterval(function () {
        this._loadAll();
      }.bind(this), 60000);
    },

    onExit: function () {
      if (this._timer) clearInterval(this._timer);
    },

    _loadAll: function () {
      this._loadSummary();
      this._loadMessages();
      this._loadFlows();
    },

    _loadSummary: function () {
      var that = this;
      fetch(CAP + "/getSummary()")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          that.getView().getModel("summary").setData(data);
          that._drawPie(data);
          that._drawLine();
        })
        .catch(function (e) {
          console.error("Summary error:", e);
        });
    },

    _loadMessages: function () {
      var that = this;
      var status = this.byId("statusFilter")
        ? this.byId("statusFilter").getSelectedKey() : "ALL";
      var flow = this.byId("flowFilter")
        ? this.byId("flowFilter").getSelectedKey() : "";
      var url = CAP + "/getMessages(status='"
        + status + "',flow="
        + (flow ? "'" + flow + "'" : "null")
        + ",top=100)";

      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var items = data.value || data;
          that.getView().getModel("messages").setData(items);
          var errs = items.filter(function (m) {
            return m.Status === "FAILED" || m.Status === "RETRY";
          });
          that.getView().getModel("errors").setData(errs);
          MessageToast.show("Loaded " + items.length + " messages");
        })
        .catch(function (e) {
          console.error("Messages error:", e);
        });
    },

    _loadFlows: function () {
      var that = this;
      fetch(CAP + "/getFlows()")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var flows = data.value || data;
          var sel = that.byId("flowFilter");
          if (!sel) return;
          while (sel.getItems().length > 1) {
            sel.removeItem(1);
          }
          flows.forEach(function (f) {
            sel.addItem(
              new sap.ui.core.Item({ key: f.name, text: f.name })
            );
          });
        })
        .catch(function (e) { console.error("Flows error:", e); });
    },

    _drawPie: function (s) {
      var that = this;
      setTimeout(function () {
        var c = document.getElementById(
          that.getView().createId("pieCanvas")
        );
        if (!c) return;
        c.width  = 220;
        c.height = 200;
        var ctx   = c.getContext("2d");
        var data  = [
          { v: s.COMPLETED || 0, color: "#27ae60" },
          { v: s.FAILED    || 0, color: "#e74c3c" },
          { v: s.PROCESSING|| 0, color: "#f39c12" },
          { v: s.RETRY     || 0, color: "#3498db" }
        ];
        var total = data.reduce(function (a, d) { return a + d.v; }, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        if (total === 0) {
          ctx.fillStyle = "#999";
          ctx.font = "13px Arial";
          ctx.textAlign = "center";
          ctx.fillText("No data", c.width / 2, c.height / 2);
          return;
        }
        var cx = c.width / 2, cy = c.height / 2;
        var r  = Math.min(cx, cy) - 12;
        var a  = -Math.PI / 2;
        data.forEach(function (d) {
          var slice = (d.v / total) * 2 * Math.PI;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, a, a + slice);
          ctx.closePath();
          ctx.fillStyle = d.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          a += slice;
        });
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.52, 0, 2 * Math.PI);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }, 400);
    },

    _drawLine: function () {
      var that = this;
      setTimeout(function () {
        var c = document.getElementById(
          that.getView().createId("lineCanvas")
        );
        if (!c) return;
        c.width  = c.parentElement
          ? c.parentElement.offsetWidth || 600 : 600;
        c.height = 200;
        var ctx = c.getContext("2d");
        var W = c.width, H = c.height;
        var pad = { top: 20, right: 20, bottom: 30, left: 44 };
        var iW = W - pad.left - pad.right;
        var iH = H - pad.top  - pad.bottom;

        var pts = [];
        for (var i = 23; i >= 0; i--) {
          var h = new Date(Date.now() - i * 3600000);
          pts.push({
            lbl: h.getHours() + ":00",
            v: Math.floor(Math.random() * 200) + 50
          });
        }

        var maxV = Math.max.apply(null, pts.map(function (p) {
          return p.v;
        })) || 1;
        var stepX = iW / (pts.length - 1);

        ctx.clearRect(0, 0, W, H);

        ctx.strokeStyle = "#eee";
        ctx.lineWidth = 1;
        for (var g = 0; g <= 4; g++) {
          var gy = pad.top + iH - (g / 4) * iH;
          ctx.beginPath();
          ctx.moveTo(pad.left, gy);
          ctx.lineTo(pad.left + iW, gy);
          ctx.stroke();
          ctx.fillStyle = "#aaa";
          ctx.font = "10px Arial";
          ctx.textAlign = "right";
          ctx.fillText(
            Math.round((g / 4) * maxV),
            pad.left - 4, gy + 3
          );
        }

        ctx.beginPath();
        pts.forEach(function (p, i) {
          var x = pad.left + i * stepX;
          var y = pad.top + iH - (p.v / maxV) * iH;
          if (i === 0) { ctx.moveTo(x, y); }
          else { ctx.lineTo(x, y); }
        });
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth   = 2;
        ctx.stroke();

        var lastX = pad.left + (pts.length - 1) * stepX;
        ctx.lineTo(lastX, pad.top + iH);
        ctx.lineTo(pad.left, pad.top + iH);
        ctx.closePath();
        ctx.fillStyle = "rgba(59,130,246,0.1)";
        ctx.fill();

        ctx.fillStyle = "#888";
        ctx.font = "9px Arial";
        ctx.textAlign = "center";
        pts.forEach(function (p, i) {
          if (i % 4 === 0) {
            var x = pad.left + i * stepX;
            ctx.fillText(p.lbl, x, H - 5);
          }
        });
      }, 400);
    },

    onRefresh: function () {
      this._loadAll();
      MessageToast.show("Refreshing data...");
    },

    onFilterChange: function () { this._loadMessages(); },

    onSearch: function (oEvent) {
      var q = oEvent.getParameter("query");
      var b = this.byId("msgTable").getBinding("items");
      if (!q) { b.filter([]); return; }
      b.filter([new sap.ui.model.Filter(
        "MessageGuid",
        sap.ui.model.FilterOperator.Contains,
        q
      )]);
    },

    onViewDetails: function (oEvent) {
      var msg = oEvent.getSource()
        .getBindingContext("messages").getObject();
      this._showDialog(msg);
    },

    onErrDetails: function (oEvent) {
      var msg = oEvent.getSource()
        .getBindingContext("errors").getObject();
      this._showDialog(msg);
    },

    onRowPress: function (oEvent) {
      var msg = oEvent.getSource()
        .getBindingContext("messages").getObject();
      this._showDialog(msg);
    },

    onMsgIdPress: function (oEvent) {
      var msg = oEvent.getSource()
        .getBindingContext("messages").getObject();
      if (msg.AlternateWebLink) {
        sap.m.URLHelper.redirect(msg.AlternateWebLink, true);
      }
    },

    onExport: function () {
      var data = this.getView().getModel("messages").getData();
      var keys = [
        "MessageGuid","IntegrationFlowName","Status",
        "LogStart","LogEnd","Sender","Receiver"
      ];
      var csv = [keys.join(",")].concat(
        data.map(function (r) {
          return keys.map(function (k) {
            return '"' + (r[k] || "") + '"';
          }).join(",");
        })
      ).join("\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv" })
      );
      a.download = "cpi_messages.csv";
      a.click();
    },

    _showDialog: function (msg) {
      var that = this;
      var oDialog = new sap.m.Dialog({
        title: "Message Details — " + (msg.IntegrationFlowName || ""),
        contentWidth: "500px",
        content: [
          new sap.m.VBox({
            class: "sapUiSmallMargin",
            items: [
              new sap.m.Label({ text: "Message GUID" }),
              new sap.m.Text({ text: msg.MessageGuid || "-" }),
              new sap.m.Label({ text: "Status" }),
              new sap.m.ObjectStatus({
                text: msg.Status,
                state: that.statusToState(msg.Status)
              }),
              new sap.m.Label({ text: "Start Time" }),
              new sap.m.Text({
                text: that.formatDateTime(msg.LogStart)
              }),
              new sap.m.Label({ text: "End Time" }),
              new sap.m.Text({
                text: that.formatDateTime(msg.LogEnd)
              }),
              new sap.m.Label({ text: "Sender / Receiver" }),
              new sap.m.Text({
                text: (msg.Sender || "-") + " → " + (msg.Receiver || "-")
              })
            ]
          })
        ],
        beginButton: new sap.m.Button({
          text: "Load Error Info",
          type: "Emphasized",
          press: function () {
            fetch(CAP + "/getErrorInfo(guid='" + msg.MessageGuid + "')")
              .then(function (r) { return r.json(); })
              .then(function (err) {
                oDialog.addContent(new sap.m.MessageStrip({
                  text: err.ErrorMessage || "No error details found",
                  type: "Error",
                  showIcon: true
                }));
              })
              .catch(function () {
                oDialog.addContent(new sap.m.MessageStrip({
                  text: "Could not load error info",
                  type: "Warning",
                  showIcon: true
                }));
              });
          }
        }),
        endButton: new sap.m.Button({
          text: "Close",
          press: function () {
            oDialog.close();
            oDialog.destroy();
          }
        })
      });
      oDialog.open();
    },

    statusToState: function (s) {
      var map = {
        COMPLETED: "Success",
        FAILED: "Error",
        PROCESSING: "Warning",
        RETRY: "Warning"
      };
      return map[s] || "None";
    },

    formatDateTime: function (v) {
      if (!v) return "-";
      var m = v.match(/\/Date\((\d+)\)\//);
      if (m) return new Date(parseInt(m[1])).toLocaleString();
      return new Date(v).toLocaleString();
    }

  });
});
