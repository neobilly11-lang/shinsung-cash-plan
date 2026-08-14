(function(){
  'use strict';
  if(window.__mesShippingVoyageDatesV1)return;
  window.__mesShippingVoyageDatesV1=true;

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function escapeHtml(value){return typeof esc==='function'?esc(value):text(value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dateOnly(value){
    var match=text(value).match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    return match?match[1]+'-'+String(match[2]).padStart(2,'0')+'-'+String(match[3]).padStart(2,'0'):text(value).slice(0,10);
  }
  function shippingSchema(){return typeof schemas!=='undefined'&&schemas.shipping?schemas.shipping:null;}
  function baseRows(){return window.__mesVoyageBaseShippingRows?list(window.__mesVoyageBaseShippingRows()):[];}
  function firstDate(rows,fields){
    for(var i=0;i<rows.length;i++)for(var j=0;j<fields.length;j++){var value=dateOnly(rows[i]&&rows[i][fields[j]]);if(value)return value;}
    return'';
  }
  function enrichedRows(){
    return baseRows().map(function(row){
      var shipments=list(row.shipments),items=list(row.items);
      row.etdExpectedDate=firstDate(shipments,['etdExpectedDate','expectedEtdDate','departurePlanDate'])||firstDate(items,['etdExpectedDate','expectedEtdDate','departurePlanDate']);
      row.etdConfirmedDate=firstDate(shipments,['etdConfirmedDate','departureConfirmedDate'])||firstDate(items,['etdConfirmedDate','departureConfirmedDate']);
      return row;
    });
  }
  function dateButton(row){
    var id=encodeURIComponent(text(row.id));
    return function(value,label){
      var shown=dateOnly(value)||'날짜 입력';
      return"<button type='button' class='btn mes-voyage-date-btn' onclick=\"event.stopPropagation();openMesVoyageDates(decodeURIComponent('"+id+"'))\" aria-label='"+escapeHtml(label+" 수정")+"'>"+escapeHtml(shown)+"</button>";
    };
  }
  function findRow(id){return enrichedRows().find(function(row){return text(row.id)===text(id);})||null;}

  window.openMesVoyageDates=function(id){
    var row=findRow(id);if(!row){if(typeof toast==='function')toast('출고자료를 찾을 수 없습니다.',true);return;}
    $('modalTitle').textContent='예상 ETD·확정 ETD 입력';
    $('modalBody').innerHTML="<div class='detail-banner'><h2>"+escapeHtml(row.soNo||'출고 일정')+"</h2><p>예상 출항일과 확정 출항일을 입력하면 출고현황과 출항 일정표에 함께 저장됩니다.</p></div>"
      +"<form class='form-grid' onsubmit=\"event.preventDefault();saveMesVoyageDates(decodeURIComponent('"+encodeURIComponent(text(row.id))+"'),this)\">"
      +"<label>예상 ETD<input type='date' name='etdExpectedDate' value='"+escapeHtml(row.etdExpectedDate)+"'></label>"
      +"<label>확정 ETD<input type='date' name='etdConfirmedDate' value='"+escapeHtml(row.etdConfirmedDate)+"'></label>"
      +"<div class='wide voyage-date-guide'>예상 ETD는 일정표의 ‘출항 예정일’, 확정 ETD는 ‘출항 확정일’로 표시됩니다. ETA 입력란은 사용하지 않습니다.</div>"
      +"<div class='wide actions'><button class='btn primary' type='submit'>ETD 날짜 저장</button><button class='btn' type='button' onclick='closeModal()'>취소</button></div></form>";
    document.querySelector('#modal .modal-card')?.classList.add('wide-modal');
    $('modal').classList.add('on');
  };
  window.saveMesVoyageDates=async function(id,form){
    var row=findRow(id);if(!row){if(typeof toast==='function')toast('출고자료를 찾을 수 없습니다.',true);return;}
    var data=new FormData(form),expectedEtd=dateOnly(data.get('etdExpectedDate')),confirmedEtd=dateOnly(data.get('etdConfirmedDate'));
    var itemIds=new Set(list(row.items).map(function(item){return text(item.id);}).filter(Boolean));
    await commit('예상 ETD·확정 ETD 날짜',['shipments','salesOrders'],function(shared){
      var shipmentMatched=false;
      list(shared.shipments).forEach(function(shipment){
        var matched=(row.shipmentId&&text(shipment.id)===text(row.shipmentId))
          ||(shipment.salesOrderId&&itemIds.has(text(shipment.salesOrderId)))
          ||(!row.shipmentId&&text(shipment.soNo)===text(row.soNo));
        if(!matched)return;shipmentMatched=true;
        Object.assign(shipment,{etdExpectedDate:expectedEtd,expectedEtdDate:expectedEtd,departurePlanDate:expectedEtd,etdConfirmedDate:confirmedEtd,departureConfirmedDate:confirmedEtd,updatedAt:new Date().toISOString(),updatedByName:typeof currentUserName==='function'?currentUserName():''});
        delete shipment.etaExpectedDate;delete shipment.arrivalExpectedDate;
      });
      list(shared.salesOrders).forEach(function(order){
        if((itemIds.size&&itemIds.has(text(order.id)))||(!itemIds.size&&text(order.soNo)===text(row.soNo))){
          Object.assign(order,{etdExpectedDate:expectedEtd,expectedEtdDate:expectedEtd,departurePlanDate:expectedEtd,etdConfirmedDate:confirmedEtd,departureConfirmedDate:confirmedEtd,updatedAt:new Date().toISOString(),updatedByName:typeof currentUserName==='function'?currentUserName():''});
          delete order.etaExpectedDate;delete order.arrivalExpectedDate;
        }
      });
      if(!shipmentMatched){
        var firstItem=list(row.items)[0]||{};
        list(shared.shipments).push({
          id:row.shipmentId||crypto.randomUUID(),salesOrderId:firstItem.id||'',soNo:row.soNo||firstItem.soNo||'',status:row.status||firstItem.status||'SHIPPED',
          weight:Number(row.shippedWeight||row.weight||firstItem.weight)||0,shippedWeight:Number(row.shippedWeight||row.weight||firstItem.weight)||0,
          shippedAt:row.shippedAt||firstItem.shippedAt||new Date().toISOString(),etdExpectedDate:expectedEtd,expectedEtdDate:expectedEtd,departurePlanDate:expectedEtd,
          etdConfirmedDate:confirmedEtd,departureConfirmedDate:confirmedEtd,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
          updatedByName:typeof currentUserName==='function'?currentUserName():''
        });
      }
    });
    closeModal();
    if(typeof render==='function')render();
  };

  var schema=shippingSchema();
  if(schema){
    window.__mesVoyageBaseShippingRows=schema.rows;
    schema.rows=enrichedRows;
    var previous=list(schema.cols).filter(function(column){return !['예상 ETD','확정 ETD','ETD 확정 날짜','ETA 예상일'].includes(text(column&&column[0]));});
    var insertAt=Math.min(2,previous.length);
    previous.splice(insertAt,0,
      ['예상 ETD',function(row){return dateButton(row)(row.etdExpectedDate,'예상 ETD');}],
      ['확정 ETD',function(row){return dateButton(row)(row.etdConfirmedDate,'확정 ETD');}]
    );
    schema.cols=previous;
  }

  var originalDetail=typeof window.mesDetailMarkup==='function'?window.mesDetailMarkup:null;
  if(originalDetail){
    window.mesDetailMarkup=function(view,row){
      var html=originalDetail.apply(this,arguments);if(view!=='shipping')return html;
      var current=findRow(row.id)||row;
      return html+"<section class='detail-section'><h3>선박 일정</h3><div class='voyage-summary'><div><span>예상 ETD</span><b>"+escapeHtml(current.etdExpectedDate||'미입력')+"</b></div><div><span>확정 ETD</span><b>"+escapeHtml(current.etdConfirmedDate||'미입력')+"</b></div></div><button class='btn primary' onclick=\"openMesVoyageDates(decodeURIComponent('"+encodeURIComponent(text(current.id))+"'))\">ETD 날짜 수정</button></section>";
    };
  }

  var style=document.createElement('style');
  style.textContent=".mes-voyage-date-btn{padding:7px 10px;min-width:112px;white-space:nowrap}.voyage-date-guide{padding:13px;border-radius:10px;background:#eef7f5;color:#34534c}.voyage-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}.voyage-summary>div{padding:14px;border:1px solid var(--line);border-radius:12px;background:#f8fbfc}.voyage-summary span{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}.voyage-summary b{font-size:18px}@media(max-width:640px){.voyage-summary{grid-template-columns:1fr}.mes-voyage-date-btn{width:100%;min-width:0}}";
  document.head.appendChild(style);
  document.documentElement.dataset.mesShippingVoyageDatesV1='loaded';
  if(typeof currentView!=='undefined'&&currentView==='shipping'&&typeof render==='function')render();
})();
