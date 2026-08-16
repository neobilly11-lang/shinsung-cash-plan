(function(){
  'use strict';
  if(window.__mesSalesDetailFixV1)return;
  window.__mesSalesDetailFixV1=true;

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function number(value){var n=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(n)?n:0;}
  function round2(value){return Math.round(number(value)*100)/100;}
  function option(value,current){return'<option '+(text(value)===text(current)?'selected':'')+'>'+esc(value)+'</option>';}
  function salesItems(row){return list(row&&row.items).length?list(row.items):list(state.salesOrders).filter(function(item){return text(item.soNo)===text(row&&row.soNo);});}

  var previousShow=window.showMesDetailEditor;
  window.showMesDetailEditor=function(){
    var detail=window.mesCurrentDetail||mesCurrentDetail||{},view=detail.view,id=detail.id,row=mesRow(view,id);
    if(view!=='sales')return previousShow.apply(this,arguments);
    if(!row)return;
    var items=salesItems(row),source=items[0]||{},currency=source.currency||row.currency||(source.packingListType==='OVERSEAS'?'USD':'KRW');
    var exchangeRate=number(source.exchangeRate||row.exchangeRate)||1;
    $('modalBody').innerHTML='<form class="form-grid mes-sales-edit-form" onsubmit="saveMesDetail(event,this)">'
      +'<label>S.O 번호<input name="soNo" value="'+esc(row.soNo)+'"></label>'
      +'<label>판매처<input name="customer" value="'+esc(row.customer)+'"></label>'
      +'<label>출항예정일<input name="shipDate" type="date" value="'+(date(row.shipDate)==='-'?'':date(row.shipDate))+'"></label>'
      +'<label>SHIPMENTS<input name="shipment" value="'+esc(source.shipment||source.shippingTerm||source.deliveryTerm||'')+'"></label>'
      +'<label>PAYMENT<input name="paymentTerm" value="'+esc(source.paymentTerm||source.payment||source.paymentTerms||'')+'"></label>'
      +'<label>통화<select name="currency">'+option('KRW',currency)+option('USD',currency)+option('EUR',currency)+option('JPY',currency)+'</select></label>'
      +'<label>판매 환율<input name="exchangeRate" type="number" min="0" step="0.01" inputmode="decimal" value="'+exchangeRate+'"></label>'
      +'<div class="registration-lines"><h3>S.O 품목</h3>'+items.map(function(item){return mesEditLine(item,'SO');}).join('')+'</div>'
      +'<div class="wide actions"><button type="submit" class="btn primary">판매 환율 포함 수정 저장</button><button type="button" class="btn" onclick="openMesDetail(\'sales\',\''+esc(id)+'\')">취소</button></div></form>';
    document.querySelector('#modal .modal-card')?.classList.add('wide-modal');
  };

  var previousSave=window.saveMesDetail;
  window.saveMesDetail=async function(event,form){
    var detail=window.mesCurrentDetail||mesCurrentDetail||{},view=detail.view;
    if(view!=='sales')return previousSave.apply(this,arguments);
    event.preventDefault();
    var values=formData(form),exchangeRate=round2(values.exchangeRate),currency=text(values.currency)||'KRW';
    if(exchangeRate<0){if(typeof toast==='function')toast('판매 환율을 확인하세요.',true);return;}
    var ok=await commit('S.O 상세 판매 환율 수정',['salesOrders'],function(shared){
      form.querySelectorAll('.edit-line').forEach(function(line){
        var item=list(shared.salesOrders).find(function(entry){return text(entry.id)===text(line.dataset.id);});if(!item)return;
        var data=mesLineData(line),weight=round2(data.weight),unitPrice=round2(item.unitPrice||item.salesUnitPrice),grade=[data.productType,data.mainGrade,data.subGrade,data.detailGrade].filter(Boolean).join(' · ');
        Object.assign(item,{soNo:values.soNo,customer:values.customer,shipDate:values.shipDate,shipment:values.shipment,shippingTerm:values.shipment,deliveryTerm:values.shipment,paymentTerm:values.paymentTerm,payment:values.paymentTerm,paymentTerms:values.paymentTerm,currency:currency,exchangeRate:exchangeRate,
          productType:data.productType,mainGrade:data.mainGrade,subGrade:data.subGrade,detailGrade:data.detailGrade,grade:grade,
          weight:weight,status:data.status,unitPrice:unitPrice,amount:round2(weight*unitPrice),updatedAt:new Date().toISOString(),updatedByName:currentUserName()});
      });
    });
    if(ok){openMesDetail('sales',values.soNo);if(typeof toast==='function')toast('판매 환율과 S.O 상세내용을 저장했습니다.');}
  };

  var previousFilterControls=window.filterControls;
  window.filterControls=function(){
    var html=previousFilterControls.apply(this,arguments);
    if(typeof currentView==='undefined'||currentView!=='sales')return html;
    var template=document.createElement('template');template.innerHTML=html;
    template.content.querySelectorAll('.control').forEach(function(control){
      var label=control.querySelector('label'),name=text(label&&label.textContent);
      if(name==='저장일 시작'||name==='저장일 종료')control.remove();
    });
    return template.innerHTML;
  };

  document.documentElement.dataset.mesSalesDetailFixV1='loaded';
  if(typeof currentView!=='undefined'&&currentView==='sales'&&typeof render==='function')render();
})();

