(function(){
  "use strict";

  var activeInput=null;
  var activeKind="";
  var picker=null;

  function list(value){return Array.isArray(value)?value:[]}
  function text(value){return String(value==null?"":value).trim()}
  function key(value){return text(value).toLocaleLowerCase()}
  function uniq(values){
    var seen=new Set();
    return values.map(text).filter(function(value){
      var k=key(value);
      if(!k||seen.has(k))return false;
      seen.add(k);
      return true;
    });
  }
  function appState(){
    try{return typeof state!=="undefined"&&state?state:{}}catch(_){return{}}
  }
  function mainOptions(){
    var s=appState();
    return uniq([].concat(
      list(s.mainGrades),
      list(s.gradeMasters).map(function(x){return x&&x.main}),
      list(s.splits).map(function(x){return x&&x.mainGrade}),
      list(s.bags).map(function(x){return x&&(x.mainGrade||x.grade)}),
      list(s.salesOrders).map(function(x){return x&&(x.mainGrade||x.grade)})
    )).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"})});
  }
  function subOptions(main){
    var s=appState(),exact=key(main),related=[],all=[];
    list(s.gradeMasters).forEach(function(x){
      if(!x)return;
      all.push(x.sub);
      if(exact&&key(x.main)===exact)related.push(x.sub);
    });
    list(s.splits).forEach(function(x){
      if(!x)return;
      all.push(x.subGrade);
      if(exact&&key(x.mainGrade)===exact)related.push(x.subGrade);
    });
    list(s.bags).forEach(function(x){
      if(!x)return;
      all.push(x.subGrade);
      if(exact&&key(x.mainGrade||x.grade)===exact)related.push(x.subGrade);
    });
    list(s.salesOrders).forEach(function(x){
      if(!x)return;
      all.push(x.subGrade);
      if(exact&&key(x.mainGrade||x.grade)===exact)related.push(x.subGrade);
    });
    all=uniq([].concat(list(s.subGrades),all)).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"})});
    related=uniq(related);
    return uniq(related.concat(all));
  }
  function productTypeFor(main){
    var s=appState(),wanted=key(main),mapped=s.gradeTypes&&text(s.gradeTypes[main]);
    if(mapped)return mapped;
    var sources=[].concat(list(s.gradeMasters),list(s.splits),list(s.bags),list(s.salesOrders));
    for(var i=0;i<sources.length;i++){
      var row=sources[i]||{};
      if(key(row.main||row.mainGrade||row.grade)===wanted){
        var value=text(row.type||row.productType);
        if(value)return value;
      }
    }
    return"";
  }
  function lineFor(input){return input&&input.closest(".line-editor")}
  function syncOrderLine(line){
    if(!line)return;
    var product=line.querySelector('input[name="productType"]'),main=line.querySelector('input[name="mainGrade"]'),sub=line.querySelector('input[name="subGrade"]'),description=line.querySelector('input[name="description"]');
    if(description)description.value=[product&&product.value,main&&main.value,sub&&sub.value].map(text).filter(Boolean).join(" · ");
  }
  function isSoModal(){
    var body=document.getElementById("modalBody"),title=text(document.getElementById("modalTitle")&&document.getElementById("modalTitle").textContent);
    return !!(body&&(body.querySelector('input[name="soNo"]')||/S\.O|판매계획|출하계획|출고현황/.test(title)));
  }
  function ensurePicker(){
    if(picker)return picker;
    picker=document.createElement("section");
    picker.id="mesSoGradePicker";
    picker.className="mes-so-grade-picker";
    picker.hidden=true;
    picker.innerHTML='<div class="mes-so-picker-head"><strong></strong><button type="button" class="mes-so-picker-close" aria-label="검색결과 닫기">×</button></div><div class="mes-so-picker-results"></div><button type="button" class="mes-so-picker-clear">선택 지우기 · 다른 값 직접 입력</button>';
    document.body.appendChild(picker);
    picker.querySelector(".mes-so-picker-close").addEventListener("click",closePicker);
    picker.querySelector(".mes-so-picker-clear").addEventListener("click",function(){
      if(!activeInput)return closePicker();
      activeInput.value="";
      activeInput.dispatchEvent(new Event("input",{bubbles:true}));
      closePicker();
      activeInput.focus();
    });
    return picker;
  }
  function placePicker(){
    if(!picker||picker.hidden||!activeInput)return;
    var rect=activeInput.getBoundingClientRect(),vv=window.visualViewport;
    var viewW=vv?vv.width:window.innerWidth,viewH=vv?vv.height:window.innerHeight,offsetTop=vv?vv.offsetTop:0;
    var width=Math.max(260,Math.min(rect.width,viewW-20));
    var left=Math.max(10,Math.min(rect.left,viewW-width-10));
    picker.style.left=left+"px";
    picker.style.width=width+"px";
    picker.style.bottom="auto";
    var desired=Math.min(270,Math.max(170,viewH*.34));
    var roomBelow=offsetTop+viewH-rect.bottom-10;
    if(roomBelow>=Math.min(170,desired)){
      picker.style.top=(rect.bottom+6)+"px";
      picker.style.maxHeight=Math.max(150,Math.min(desired,roomBelow))+"px";
    }else{
      picker.style.top=Math.max(offsetTop+8,rect.top-desired-6)+"px";
      picker.style.maxHeight=Math.max(150,Math.min(desired,rect.top-offsetTop-14))+"px";
    }
  }
  function currentOptions(){
    if(!activeInput)return[];
    var line=lineFor(activeInput),main=line&&line.querySelector('input[name="mainGrade"]');
    return activeKind==="main"?mainOptions():subOptions(main&&main.value);
  }
  function selectValue(value){
    if(!activeInput)return;
    var input=activeInput,line=lineFor(input),previousValue=input.value;
    input.value=value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    if(activeKind==="main"){
      var type=line&&line.querySelector('input[name="productType"]'),sub=line&&line.querySelector('input[name="subGrade"]');
      var inferred=productTypeFor(value);
      if(type&&inferred){type.value=inferred;type.dispatchEvent(new Event("change",{bubbles:true}))}
      if(sub&&sub.value&&key(previousValue)!==key(value)){
        sub.value="";
        sub.dispatchEvent(new Event("input",{bubbles:true}));
        sub.dispatchEvent(new Event("change",{bubbles:true}));
      }
      closePicker();
      if(sub){sub.focus();openPicker(sub,"sub")}
    }else{
      closePicker();
      var next=line&&(line.querySelector('input[name="detailGrade"]')||line.querySelector('input[name="weight"]'));
      if(next){next.focus();next.scrollIntoView({block:"center",behavior:"smooth"})}
    }
  }
  function renderResults(){
    if(!picker||picker.hidden||!activeInput)return;
    var results=picker.querySelector(".mes-so-picker-results"),query=key(activeInput.value);
    var options=currentOptions().filter(function(value){return !query||key(value).includes(query)}).slice(0,80);
    results.innerHTML="";
    if(!options.length){
      var empty=document.createElement("div");
      empty.className="mes-so-picker-empty";
      empty.textContent="일치하는 저장 강종이 없습니다. 현재 입력값을 직접 사용할 수 있습니다.";
      results.appendChild(empty);
    }else{
      options.forEach(function(value,index){
        var button=document.createElement("button");
        button.type="button";
        button.className="mes-so-picker-option"+(index===0?" first-result":"");
        button.textContent=value;
        button.addEventListener("pointerdown",function(event){event.preventDefault()});
        button.addEventListener("click",function(){selectValue(value)});
        results.appendChild(button);
      });
    }
    picker.querySelector(".mes-so-picker-head strong").textContent=activeKind==="main"?"저장된 최종강종 검색결과":"저장된 소강종 검색결과";
    placePicker();
  }
  function openPicker(input,kind){
    if(!input||!isSoModal())return;
    ensurePicker();
    activeInput=input;
    activeKind=kind;
    picker.hidden=false;
    renderResults();
  }
  function closePicker(){if(picker)picker.hidden=true}
  function bindInput(input,kind){
    if(!input||input.dataset.mesSoPickerBound)return;
    input.dataset.mesSoPickerBound="1";
    input.autocomplete="off";
    input.setAttribute("role","combobox");
    input.setAttribute("aria-autocomplete","list");
    input.placeholder=kind==="main"?"저장된 최종강종 검색·선택":"저장된 소강종 검색·선택";
    var label=input.closest("label");
    if(label){
      var first=label.firstChild;
      if(first&&first.nodeType===Node.TEXT_NODE)first.nodeValue=kind==="main"?"최종강종 검색·선택":"소강종 검색·선택";
    }
    input.addEventListener("focus",function(){openPicker(input,kind)});
    input.addEventListener("click",function(){openPicker(input,kind)});
    input.addEventListener("input",function(){openPicker(input,kind);renderResults()});
    input.addEventListener("change",function(){syncOrderLine(lineFor(input))});
    input.addEventListener("keydown",function(event){
      if(event.key==="Enter"){
        event.preventDefault();
        event.stopPropagation();
        var first=picker&&!picker.hidden&&picker.querySelector(".mes-so-picker-option");
        if(first)first.click();
      }else if(event.key==="Escape")closePicker();
    });
  }
  function decorateOrderCreate(body){
    var form=body.querySelector("#mesOrderCreateForm");
    if(!form||!/S\.O/.test(text(document.getElementById("modalTitle")&&document.getElementById("modalTitle").textContent)))return;
    form.querySelectorAll(".order-create-line").forEach(function(line){
      if(line.dataset.mesSoOrderGradePicker)return;
      var description=line.querySelector('input[name="description"]');
      if(!description)return;
      line.dataset.mesSoOrderGradePicker="1";
      var initial=text(description.value),label=description.closest("label");
      description.type="hidden";
      var grid=description.closest(".form-grid");
      var productLabel=document.createElement("label");
      productLabel.textContent="품종";
      var product=document.createElement("input");product.name="productType";product.readOnly=true;product.placeholder="최종강종 선택 시 자동입력";productLabel.appendChild(product);
      var mainLabel=document.createElement("label");mainLabel.className="wide";mainLabel.textContent="최종강종 검색·선택";
      var main=document.createElement("input");main.name="mainGrade";main.required=true;main.value=initial;mainLabel.appendChild(main);
      var subLabel=document.createElement("label");subLabel.textContent="소강종 검색·선택";
      var sub=document.createElement("input");sub.name="subGrade";subLabel.appendChild(sub);
      if(label){label.textContent="S.O 저장 강종";label.hidden=true;label.appendChild(description);label.insertAdjacentElement("afterend",subLabel);label.insertAdjacentElement("afterend",mainLabel);label.insertAdjacentElement("afterend",productLabel)}
      else if(grid){grid.prepend(subLabel);grid.prepend(mainLabel);grid.prepend(productLabel)}
      bindInput(main,"main");bindInput(sub,"sub");
      [product,main,sub].forEach(function(input){input.addEventListener("input",function(){syncOrderLine(line)});input.addEventListener("change",function(){syncOrderLine(line)})});
      syncOrderLine(line);
    });
  }
  function decorate(){
    if(!isSoModal())return;
    var body=document.getElementById("modalBody");
    if(!body)return;
    decorateOrderCreate(body);
    body.querySelectorAll('.line-editor input[name="mainGrade"]').forEach(function(input){bindInput(input,"main")});
    body.querySelectorAll('.line-editor input[name="subGrade"]').forEach(function(input){bindInput(input,"sub")});
  }

  var style=document.createElement("style");
  style.id="mesSoGradePickerStyle";
  style.textContent="\
  .mes-so-grade-picker{position:fixed;z-index:10050;display:flex;flex-direction:column;padding:10px;background:#fff;border:2px solid #0b918f;border-radius:16px;box-shadow:0 14px 44px rgba(7,31,55,.28);overflow:hidden}\
  .mes-so-grade-picker[hidden]{display:none!important}\
  .mes-so-picker-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 2px 8px;color:#103e3a}\
  .mes-so-picker-close{border:0;background:#edf3f3;border-radius:10px;width:38px;height:38px;font-size:25px;line-height:1;cursor:pointer}\
  .mes-so-picker-results{display:flex;flex-direction:column;gap:6px;overflow:auto;overscroll-behavior:contain}\
  .mes-so-picker-option,.mes-so-picker-clear{min-height:48px;border:1px solid #d6e1e0;border-radius:11px;background:#fff;text-align:left;padding:10px 14px;font:inherit;font-weight:800;color:#142b2a;cursor:pointer}\
  .mes-so-picker-option.first-result{border-color:#0b918f;background:#eaf8f5}\
  .mes-so-picker-clear{margin-top:8px;background:#fff6da;border-color:#f0ce68;color:#6b5310;text-align:center}\
  .mes-so-picker-empty{padding:16px 10px;color:#6c7776;line-height:1.45}\
  input[data-mes-so-picker-bound=\"1\"]{padding-right:44px!important;background-image:linear-gradient(45deg,transparent 50%,#0b756c 50%),linear-gradient(135deg,#0b756c 50%,transparent 50%);background-position:calc(100% - 20px) 50%,calc(100% - 14px) 50%;background-size:6px 6px,6px 6px;background-repeat:no-repeat}\
  @media(max-width:760px){.mes-so-grade-picker{border-radius:18px}.mes-so-picker-option,.mes-so-picker-clear{min-height:54px;font-size:16px}}";
  document.head.appendChild(style);
  ensurePicker();
  new MutationObserver(function(){decorate()}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener("pointerdown",function(event){
    if(!picker||picker.hidden)return;
    if(picker.contains(event.target)||event.target===activeInput)return;
    closePicker();
  },true);
  window.addEventListener("resize",placePicker);
  window.addEventListener("scroll",placePicker,true);
  if(window.visualViewport){window.visualViewport.addEventListener("resize",placePicker);window.visualViewport.addEventListener("scroll",placePicker)}
  decorate();
  var baseSaveOrderCreate=window.saveOrderCreate;
  if(typeof baseSaveOrderCreate==="function"){
    window.saveOrderCreate=async function(event,form,type){
      if(type!=="SO")return baseSaveOrderCreate.apply(this,arguments);
      event.preventDefault();
      var head=Object.fromEntries(new FormData(form).entries()),exchangeRate=Number(head.exchangeRate)||1;
      if(typeof window.recalculateOrderAmounts==="function")window.recalculateOrderAmounts(form);
      var lines=Array.from(form.querySelectorAll(".order-create-line")).map(function(line){
        var product=text(line.querySelector('input[name="productType"]')&&line.querySelector('input[name="productType"]').value),main=text(line.querySelector('input[name="mainGrade"]')&&line.querySelector('input[name="mainGrade"]').value),sub=text(line.querySelector('input[name="subGrade"]')&&line.querySelector('input[name="subGrade"]').value),detail=text(line.querySelector('input[name="lineNote"]')&&line.querySelector('input[name="lineNote"]').value),quantity=Number(line.querySelector('input[name="quantity"]')&&line.querySelector('input[name="quantity"]').value)||0,price=Number(line.querySelector('input[name="price"]')&&line.querySelector('input[name="price"]').value)||0,amount=quantity*price,krwAmount=amount*exchangeRate;
        return{productType:product,mainGrade:main,subGrade:sub,detailGrade:detail,weight:quantity,unitPrice:price,amount:amount,krwAmount:krwAmount,grade:[product,main,sub,detail].filter(Boolean).join(" · ")};
      });
      if(!text(head.orderNo)||!text(head.partner)||!lines.length||lines.some(function(line){return !line.mainGrade||line.weight<=0})){
        if(typeof toast==="function")toast("S.O 번호·판매처·최종강종·중량을 모두 입력하세요.",true);
        return;
      }
      var stamp=new Date().toISOString();
      var ok=await commit("MES S.O 등록",["salesOrders"],function(shared){
        shared.salesOrders=(Array.isArray(shared.salesOrders)?shared.salesOrders:[]).filter(function(row){return text(row.soNo)!==text(head.orderNo)});
        lines.forEach(function(line){shared.salesOrders.push({id:crypto.randomUUID(),soNo:text(head.orderNo),poNo:text(head.linkedNo),customer:text(head.partner),address:text(head.address),tel:text(head.tel),fax:text(head.fax),shipDate:text(head.orderDate),shipment:text(head.shipment),packing:text(head.packing),note:text(head.note),currency:text(head.currency)||"USD",exchangeRate:exchangeRate,productType:line.productType,mainGrade:line.mainGrade,subGrade:line.subGrade,detailGrade:line.detailGrade,grade:line.grade,weight:line.weight,unitPrice:line.unitPrice,amount:line.amount,foreignAmount:line.amount,krwAmount:line.krwAmount,convertedAmount:line.krwAmount,status:"WAITING",createdAt:stamp,createdByName:typeof currentUserName==="function"?currentUserName():"MES"})});
      });
      if(ok){if(typeof closeModal==="function")closeModal();if(typeof openView==="function")openView("sales")}
    };
    try{saveOrderCreate=window.saveOrderCreate}catch(_){ }
  }
  document.documentElement.dataset.mesSoGradePicker="loaded";
})();
