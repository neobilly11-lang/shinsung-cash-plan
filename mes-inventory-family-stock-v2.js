(function(root){
  'use strict';

  var VERSION='20260815-family-display-5';
  var sharedExpectedSoId='';
  var sharedExpectedSoOpened='';
  try{sharedExpectedSoId=text(new URLSearchParams(location.search).get('expectedSo'));}catch(_){sharedExpectedSoId='';}
  var runtime=root.__mesRuntime||{};
  if(runtime.getState&&!Object.prototype.hasOwnProperty.call(root,'state'))Object.defineProperty(root,'state',{configurable:true,get:runtime.getState,set:runtime.setState});
  if(runtime.getView&&!Object.prototype.hasOwnProperty.call(root,'currentView'))Object.defineProperty(root,'currentView',{configurable:true,get:runtime.getView});
  root.schemas=root.schemas||runtime.schemas;
  root.fmt=root.fmt||runtime.fmt;
  root.$=root.$||runtime.$;
  root.currentUserName=root.currentUserName||runtime.currentUserName;
  root.inventoryRows=root.inventoryRows||runtime.inventoryRows;
  root.mesSection=root.mesSection||runtime.mesSection;
  root.defaults=root.defaults||runtime.defaults;
  root.commit=root.commit||(runtime.getCommit&&runtime.getCommit());
  root.render=root.render||(runtime.getRender&&runtime.getRender());
  root.toast=root.toast||(runtime.getToast&&runtime.getToast());
  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function number(value){var next=Number(value);return Number.isFinite(next)?next:0;}
  function upper(value){return text(value).toUpperCase();}
  function active(row){return row&&upper(row.status)!=='CANCELLED';}
  function round(value){return Math.round(number(value)*100)/100;}
  function encode(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}
  async function copyShareText(value){
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);return true;}}catch(_){ }
    try{var area=document.createElement('textarea');area.value=value;area.style.cssText='position:fixed;left:-9999px;top:-9999px';document.body.appendChild(area);area.focus();area.select();var copied=document.execCommand&&document.execCommand('copy');area.remove();return!!copied;}catch(_){return false;}
  }
  async function shareMessage(titleValue,message,url){
    var full=[message,url].filter(Boolean).join('\n');
    if(typeof root.mesShareText==='function')return root.mesShareText(titleValue,full);
    var mobile=!!navigator.share&&(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent||'')));
    try{if(mobile){await navigator.share({title:titleValue,text:message,url:url});return true;}}catch(error){if(error&&error.name==='AbortError')return false;}
    var copied=await copyShareText(full);
    root.toast(copied?'PC 공유 준비완료 · 카카오톡 대화창에 붙여넣으세요.':'공유문구를 자동 복사하지 못했습니다. 다시 시도해 주세요.',!copied);
    return copied;
  }
  function normalize(value){return upper(value).replace(/TURNINGS?/g,'TURNING').replace(/SOLIDS?/g,'SOLID').replace(/[^A-Z0-9가-힣]/g,'');}
  function tokens(value){return upper(value).replace(/TURNINGS?/g,'TURNING').replace(/SOLIDS?/g,'SOLID').split(/[^A-Z0-9가-힣]+/).filter(Boolean);}
  function bigrams(value){var source=normalize(value),out=[];if(source.length<2)return source?[source]:[];for(var i=0;i<source.length-1;i++)out.push(source.slice(i,i+2));return out;}
  function similarity(a,b){
    var left=normalize(a),right=normalize(b);
    if(!left||!right)return 0;
    if(left===right)return 1;
    if(left.includes(right)||right.includes(left))return Math.min(left.length,right.length)/Math.max(left.length,right.length)>=.55?.92:.72;
    var lt=tokens(a),rt=tokens(b),shared=lt.filter(function(item){return rt.includes(item);}).length;
    var tokenScore=shared/Math.max(lt.length,rt.length,1);
    var lb=bigrams(a),rb=bigrams(b),copy=rb.slice(),matched=0;
    lb.forEach(function(item){var index=copy.indexOf(item);if(index>=0){matched++;copy.splice(index,1);}});
    var dice=(2*matched)/Math.max(1,lb.length+rb.length);
    return Math.max(tokenScore,dice);
  }
  function gradeLabel(row){
    if(!row)return'';
    var structuredMain=text(row.mainGrade||row.finalGrade);
    if(structuredMain)return [row.productType,structuredMain,row.subGrade,row.detailGrade].filter(Boolean).join(' · ');
    return text(row.grade||row.originalGrade||row.itemName);
  }
  function gradeParts(row){
    row=row||{};
    var label=gradeLabel(row),segments=label.split(/\s*[·|/]\s*/).filter(Boolean);
    var first=upper(segments[0]),hasType=/^(NI|TI|STS|CO|MO|CU|OTHER)$/.test(first);
    return{
      productType:text(row.productType||(hasType?segments[0]:'')),
      mainGrade:text(row.mainGrade||row.finalGrade||segments[hasType?1:0]||label),
      subGrade:text(row.subGrade||(hasType?segments[2]:'')),
      detailGrade:text(row.detailGrade||''),
      label:label
    };
  }
  function groupKey(parts){return[parts.productType,parts.mainGrade,parts.subGrade].map(normalize).join('|');}
  function displayGrade(parts){return[parts.productType,parts.mainGrade,parts.subGrade].filter(Boolean).join(' · ')||parts.label||'미분류';}
  function ensureState(){
    if(!root.state)return;
    if(!Array.isArray(root.state.expectedSalesOrders))root.state.expectedSalesOrders=[];
    if(!Array.isArray(root.state.inventoryGradeMappings))root.state.inventoryGradeMappings=[];
  }
  function mappingRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&!/^FAMILY/.test(upper(row.kind));});}
  function familyConfigRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY';});}
  function familyExclusionRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY_EXCLUSION';});}
  function finalCandidates(){
    ensureState();
    var map=new Map();
    function add(row){
      var parts=gradeParts(row),label=displayGrade(parts),key=groupKey(parts);
      if(!parts.mainGrade||!key)return;
      if(!map.has(key))map.set(key,{productType:parts.productType,mainGrade:parts.mainGrade,subGrade:parts.subGrade,detailGrade:parts.detailGrade,label:label});
    }
    list(root.state&&root.state.gradeMasters).forEach(function(row){add({productType:row.type||row.productType,mainGrade:row.main||row.mainGrade,subGrade:row.sub||row.subGrade});});
    list(root.state&&root.state.mainGrades).forEach(function(main){add({productType:root.state.gradeTypes&&root.state.gradeTypes[main],mainGrade:main});});
    list(root.state&&root.state.splits).filter(active).forEach(add);
    list(root.state&&root.state.bags).filter(active).forEach(add);
    list(root.state&&root.state.salesOrders).filter(active).forEach(add);
    mappingRows().forEach(function(row){add(row.target||row);});
    return Array.from(map.values());
  }
  function resolveGrade(source){
    var sourceParts=gradeParts(source),sourceLabel=sourceParts.label||displayGrade(sourceParts),sourceNorm=normalize(sourceLabel);
    var manual=mappingRows().find(function(row){return normalize(row.sourceLabel||row.sourceGrade)===sourceNorm;});
    if(manual){
      var target=manual.target||manual;
      return Object.assign(gradeParts(target),{mapping:'직접 지정',sourceLabel:sourceLabel,score:1});
    }
    var candidates=finalCandidates(),best=null;
    candidates.forEach(function(candidate){
      var score=Math.max(similarity(sourceLabel,candidate.label),similarity(sourceParts.mainGrade,candidate.mainGrade));
      if(!best||score>best.score)best={candidate:candidate,score:score};
    });
    if(best&&best.score>=.7)return Object.assign({},best.candidate,{mapping:'자동 유사 '+Math.round(best.score*100)+'%',sourceLabel:sourceLabel,score:best.score});
    return Object.assign({},sourceParts,{mapping:'원문 유지',sourceLabel:sourceLabel,score:0});
  }
  function received(row){
    var status=upper(row&&row.receiptStatus);
    return !!(row&&(row.receivedAt||row.receiptConfirmedAt||row.receiptWorkerName||/RECEIVED|CONFIRMED|COMPLETE|DONE/.test(status)));
  }
  function packageWeight(row){return number(row&&((row.netWeight!=null&&row.netWeight!=='')?row.netWeight:row.weight));}
  function inspectedWeight(packageNo){
    var split=list(root.state&&root.state.splits).filter(function(row){return active(row)&&text(row.packageNo)===text(packageNo);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    var loss=list(root.state&&root.state.losses).filter(function(row){return active(row)&&text(row.packageNo)===text(packageNo);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    return split+loss;
  }
  function packedWeight(packageNo,grade){
    return list(root.state&&root.state.inputs).filter(function(row){return active(row)&&text(row.packageNo)===text(packageNo)&&(!grade||text(row.grade)===text(grade));}).reduce(function(sum,row){return sum+number(row.weight);},0);
  }
  function activeWaitingRows(){
    var latest=new Map();
    list(root.state&&root.state.waitingMoves).filter(active).forEach(function(move){
      var key=text(move.packageNo)+'|'+text(move.grade||'*'),old=latest.get(key);
      if(!old||text(old.createdAt)<text(move.createdAt))latest.set(key,move);
    });
    return Array.from(latest.values()).map(function(move){
      var confirmed=list(root.state&&root.state.splits).filter(function(row){return active(row)&&text(row.packageNo)===text(move.packageNo)&&text(row.grade)===text(move.grade);}).reduce(function(sum,row){return sum+number(row.weight);},0);
      var available=Math.max(0,confirmed-packedWeight(move.packageNo,move.grade));
      return{move:move,weight:Math.min(number(move.weight),available),grade:move.grade,packageNo:move.packageNo,location:move.to||''};
    }).filter(function(row){return row.weight>.0001;});
  }
  function activeWorkWaitingRows(){
    var rows=[];
    list(root.state&&root.state.workWaits).filter(function(row){
      var status=upper(row&&row.status||row&&row.workStatus);
      return active(row)&&!/COMPLETE|COMPLETED|DONE|FINAL|FINISHED|CLOSED|DEPLETED/.test(status);
    }).forEach(function(row){
      var weights=row.settlementGradeWeights&&typeof row.settlementGradeWeights==='object'?row.settlementGradeWeights:null;
      if(weights){
        Object.keys(weights).forEach(function(grade){var weight=number(weights[grade]);if(weight>0)rows.push({grade:grade,weight:weight,record:row});});
        return;
      }
      var grade=text(gradeLabel(row)||row.grade||row.originalGrade),weight=number(row.remainingWeight||row.pendingWeight||row.weight);
      if(weight>0)rows.push({grade:grade||'미분류',weight:weight,record:row});
    });
    return rows;
  }
  function shippedForItem(item){
    var shipments=list(root.state&&root.state.shipments).filter(function(row){return active(row)&&(text(row.salesOrderId)===text(item.id)||(row.soNo&&text(row.soNo)===text(item.soNo)));});
    var ids=new Set(shipments.map(function(row){return text(row.id);}));
    var allocations=list(root.state&&root.state.shipmentAllocations).filter(function(row){return active(row)&&ids.has(text(row.shipmentId))&&(!row.salesOrderId||text(row.salesOrderId)===text(item.id));});
    if(allocations.length)return allocations.reduce(function(sum,row){return sum+number(row.weight);},0);
    return shipments.reduce(function(sum,row){return sum+number(row.weight||row.shippedWeight);},0);
  }
  function shippingRequested(item){
    var status=upper(item&&item.shippingRequestStatus||item&&item.dispatchRequestStatus);
    return !!(item&&(item.shippingRequestedAt||item.shippingRequestNo||status==='REQUESTED'||status==='CONFIRMED'));
  }
  function familyIdentity(source){
    var parts=gradeParts(source),main=text(parts.mainGrade||parts.label),numbers=upper(main).match(/\d{3,4}/g),key='',label='';
    if(numbers&&numbers.length){key=numbers[0].replace(/^0+/,'')||numbers[0];label=key;}
    else{
      var ignored={IN:1,INCO:1,INCONEL:1,AISI:1,SUS:1,SOLID:1,TURNING:1,AS:1,VS:1,VT:1,SCRAP:1,ALLOY:1};
      var meaningful=tokens(main).filter(function(token){return !ignored[token];});
      label=meaningful.slice(0,2).join(' ')||main||'미분류';key=normalize(label);
    }
    return{key:key||normalize(main)||'미분류',label:label||main||'미분류'};
  }
  function familyConfig(key){return familyConfigRows().find(function(row){return text(row.familyKey)===text(key);});}
  function familyExcluded(key){return familyExclusionRows().some(function(row){return text(row.familyKey)===text(key);});}
  function detailGrade(source){
    var sourceParts=gradeParts(source),sourceLabel=sourceParts.label||displayGrade(sourceParts),sourceNorm=normalize(sourceLabel);
    var manual=mappingRows().find(function(row){return normalize(row.sourceLabel||row.sourceGrade)===sourceNorm;});
    if(manual){var target=manual.target||manual;return Object.assign(gradeParts(target),{mapping:'직접 지정',sourceLabel:sourceLabel,score:1});}
    return Object.assign({},sourceParts,{mapping:'원문 유지',sourceLabel:sourceLabel,score:0});
  }
  function familySummaryRows(details){
    var families=new Map();
    details.forEach(function(row){
      var identity=familyIdentity(row),key=identity.key;
      if(!families.has(key))families.set(key,{key:key,label:identity.label,rows:[]});
      families.get(key).rows.push(row);
    });
    var summaries=[];
    families.forEach(function(family){
      var memberLabels=Array.from(new Set(family.rows.map(function(row){return row.gradeLabel;}).filter(Boolean)));
      if(memberLabels.length<2||familyExcluded(family.key))return;
      var config=familyConfig(family.key),label=text(config&&config.familyLabel)||family.label;
      var summary={id:'family:'+family.key,familyKey:family.key,isFamilySummary:true,productType:Array.from(new Set(family.rows.map(function(row){return row.productType;}).filter(Boolean))).join('/')||'-',mainGrade:label+' 유사강종 예상재고',subGrade:memberLabels.length+'개 강종',arrival:0,uninspected:0,workWaiting:0,unpacked:0,completed:0,shippingPlanned:0,sources:[],memberLabels:memberLabels,memberIds:family.rows.map(function(row){return row.id;}),members:family.rows,mapping:config?'유사강종 직접 묶음':'유사강종 자동 합산'};
      family.rows.forEach(function(row){['arrival','uninspected','workWaiting','unpacked','completed','shippingPlanned'].forEach(function(stage){summary[stage]=round(summary[stage]+number(row[stage]));});summary.sources=summary.sources.concat(row.sources||[]);});
      summary.expectedStock=round(summary.arrival+summary.uninspected+summary.workWaiting+summary.unpacked+summary.completed);
      summary.familyStock=summary.expectedStock;summary.forecastRemaining=round(summary.familyStock-summary.shippingPlanned);summary.stock=summary.forecastRemaining;summary.gradeLabel=summary.mainGrade;
      summaries.push(summary);
    });
    return summaries;
  }
  function forecastRows(){
    ensureState();
    var groups=new Map();
    function add(source,stage,weight,record){
      weight=round(weight);if(!weight)return;
      var resolved=detailGrade(source),key=groupKey(resolved)||normalize(displayGrade(resolved));
      if(!groups.has(key))groups.set(key,{id:key,productType:resolved.productType,mainGrade:resolved.mainGrade||resolved.label||'미분류',subGrade:resolved.subGrade||'',arrival:0,uninspected:0,workWaiting:0,unpacked:0,completed:0,shippingPlanned:0,sources:[],mapping:resolved.mapping});
      var row=groups.get(key),canonicalLabel=displayGrade(resolved);row[stage]=round(row[stage]+weight);row.sources.push({stage:stage,weight:weight,record:record,groupId:key,sourceLabel:canonicalLabel,rawSourceLabel:text(source&&source.grade),mapping:resolved.mapping});
      if(resolved.mapping==='직접 지정')row.mapping='직접 지정';
    }
    list(root.state.pos).filter(active).forEach(function(row){
      var weight=packageWeight(row);
      if(!received(row))add(row,'arrival',weight,row);
      else add(row,'uninspected',Math.max(0,weight-inspectedWeight(row.packageNo)),row);
    });
    activeWorkWaitingRows().forEach(function(row){add({grade:row.grade},'workWaiting',row.weight,row.record);});
    activeWaitingRows().forEach(function(row){add({grade:row.grade},'unpacked',row.weight,row.move);});
    list(typeof root.inventoryRows==='function'?root.inventoryRows():[]).forEach(function(row){add(row,'completed',number(row.nw),row);});
    list(root.state.salesOrders).filter(function(item){return active(item)&&!/FINAL|SHIPPED|DONE|COMPLETE|SALES_CLOSED/.test(upper(item.status));}).forEach(function(item){add(item,'shippingPlanned',Math.max(0,number(item.weight)-shippedForItem(item)),item);});
    var details=Array.from(groups.values()).map(function(row){
      row.expectedStock=round(row.arrival+row.uninspected+row.workWaiting+row.unpacked+row.completed);
      row.forecastRemaining=round(row.expectedStock-row.shippingPlanned);
      row.stock=row.forecastRemaining;
      row.gradeLabel=displayGrade(row);
      return row;
    });
    var summaries=familySummaryRows(details),summaryByKey=new Map(summaries.map(function(row){return[row.familyKey,row];})),families=new Map();
    details.forEach(function(row){var identity=familyIdentity(row);if(!families.has(identity.key))families.set(identity.key,[]);families.get(identity.key).push(row);});
    var output=[];
    Array.from(families.keys()).sort(function(a,b){return text(a).localeCompare(text(b),'ko',{numeric:true});}).forEach(function(key){
      families.get(key).sort(function(a,b){return a.gradeLabel.localeCompare(b.gradeLabel,'ko',{numeric:true});}).forEach(function(row){output.push(row);});
      if(summaryByKey.has(key))output.push(summaryByKey.get(key));
    });
    return output;
  }
  function forecastFor(source){
    var identity=familyIdentity(source),rows=forecastRows(),family=rows.find(function(row){return row.isFamilySummary&&row.familyKey===identity.key;});
    if(family)return family;
    var resolved=detailGrade(source),key=groupKey(resolved)||normalize(displayGrade(resolved));
    return rows.find(function(row){return row.id===key;})||{id:key,productType:resolved.productType,mainGrade:resolved.mainGrade||resolved.label,subGrade:resolved.subGrade,arrival:0,uninspected:0,workWaiting:0,unpacked:0,completed:0,shippingPlanned:0,expectedStock:0,forecastRemaining:0,mapping:resolved.mapping};
  }
  function stageName(stage){return({arrival:'입항예정재고',uninspected:'미검수재고',workWaiting:'작업대기재고',unpacked:'미포장재고',completed:'완료재고',shippingPlanned:'유사강종 출하예정'})[stage]||stage;}

  function inventoryDetail(row){
    var parts=['arrival','uninspected','workWaiting','unpacked','completed','shippingPlanned'];
    var summary='<section class="detail-section"><h3>'+encode(row.gradeLabel)+' · 강종별 재고 총량</h3><div class="kpis">'+parts.map(function(key){return '<div class="kpi"><small>'+stageName(key)+'</small><strong>'+root.fmt(row[key])+' kg</strong></div>';}).join('')+'<div class="kpi"><small>예상남은재고</small><strong style="color:'+(row.forecastRemaining<0?'#b4232d':'#087566')+'">'+root.fmt(row.forecastRemaining)+' kg</strong></div></div></section>';
    var allowed=new Set(row.isFamilySummary?list(row.memberIds):[row.id]);
    var rows=list(row.sources).filter(function(source){return allowed.has(source.groupId);});
    var members=row.isFamilySummary?root.mesSection('유사강종 구성', [['강종',function(x){return x.gradeLabel||displayGrade(x);}],['입항예정',function(x){return root.fmt(x.arrival);}],['미검수',function(x){return root.fmt(x.uninspected);}],['작업대기',function(x){return root.fmt(x.workWaiting);}],['미포장',function(x){return root.fmt(x.unpacked);}],['완료재고',function(x){return root.fmt(x.completed);}],['출하예정',function(x){return root.fmt(x.shippingPlanned);}],['예상남은재고',function(x){return root.fmt(x.forecastRemaining);}]],list(row.members)):'';
    return summary+members+root.mesSection('단계별 원본 내역', [['재고단계',function(x){return stageName(x.stage);}],['재고 강종',function(x){return x.sourceLabel||'-';}],['표기방식',function(x){return x.mapping;}],['중량(kg)',function(x){return root.fmt(x.weight);}],['관련번호',function(x){return x.record&& (x.record.poNo||x.record.soNo||x.record.packageNo||x.record.completionNo)||'-';}]],rows);
  }

  function mappingSourceOptions(){
    var values=[];
    list(root.state.pos).filter(active).forEach(function(row){values.push(gradeLabel(row));});
    list(root.state.salesOrders).filter(active).forEach(function(row){values.push(gradeLabel(row));});
    return Array.from(new Set(values.filter(Boolean))).sort(function(a,b){return a.localeCompare(b,'ko');});
  }
  function mappingListHtml(){
    var rows=mappingRows();
    if(!rows.length)return'<div class="empty" style="padding:18px">직접 지정한 원문 표기가 없습니다.</div>';
    return'<div class="detail-scroll"><table class="detail-table"><thead><tr><th>원 강종</th><th>예상재고 표기</th><th>작업</th></tr></thead><tbody>'+rows.map(function(row){var target=row.target||row;return'<tr><td>'+encode(row.sourceLabel||row.sourceGrade)+'</td><td>'+encode(displayGrade(gradeParts(target)))+'</td><td><button class="btn" data-mapping-id="'+encode(row.id)+'" onclick="editInventoryGradeMapping(this.dataset.mappingId)">수정</button> <button class="btn danger" data-mapping-id="'+encode(row.id)+'" onclick="deleteInventoryGradeMapping(this.dataset.mappingId)">삭제</button></td></tr>';}).join('')+'</tbody></table></div>';
  }
  function groupedFamilyListHtml(){
    var rows=forecastRows().filter(function(row){return row.isFamilySummary;});
    var excluded=familyExclusionRows();
    var html=rows.length?'<div class="detail-scroll"><table class="detail-table"><thead><tr><th>묶음 이름</th><th>현재 묶인 강종</th><th>유사강종 재고</th><th>출하예정</th><th>예상재고</th><th>작업</th></tr></thead><tbody>'+rows.map(function(row){return'<tr><td><b>'+encode(row.mainGrade)+'</b></td><td>'+row.memberLabels.map(encode).join('<br>')+'</td><td>'+root.fmt(row.familyStock)+' kg</td><td>'+root.fmt(row.shippingPlanned)+' kg</td><td><b style="color:'+(row.forecastRemaining<0?'#b4232d':'#087566')+'">'+root.fmt(row.forecastRemaining)+' kg</b></td><td><button class="btn" data-family-key="'+encode(row.familyKey)+'" onclick="editInventoryFamily(this.dataset.familyKey)">수정</button> <button class="btn danger" data-family-key="'+encode(row.familyKey)+'" onclick="deleteInventoryFamily(this.dataset.familyKey)">묶음 삭제</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty" style="padding:24px">현재 두 개 이상 강종이 묶인 유사강종 자료가 없습니다.</div>';
    if(excluded.length)html+='<details style="margin-top:14px"><summary>삭제한 묶음 '+excluded.length+'건 · 복원하기</summary><div class="actions" style="margin-top:12px">'+excluded.map(function(row){return'<button class="btn" data-family-key="'+encode(row.familyKey)+'" onclick="restoreInventoryFamily(this.dataset.familyKey)">'+encode(row.familyLabel||row.familyKey)+' 묶음 복원</button>';}).join('')+'</div></details>';
    return html;
  }
  root.openInventoryGradeMapping=function(){
    ensureState();
    var sources=mappingSourceOptions(),candidates=finalCandidates();
    root.$('modalTitle').textContent='재고표기 방식 · 비슷한 그레이드 묶기';
    root.$('modalBody').innerHTML='<section class="detail-section"><h3>현재 묶인 유사강종만 확인·수정·삭제</h3><p>예: IN 718과 718 AS는 각각의 행을 유지하고, 바로 아래 718 유사강종 예상재고 행으로 합산됩니다.</p><div id="inventoryFamilyList">'+groupedFamilyListHtml()+'</div></section><form id="inventoryFamilyForm" class="form-grid" style="display:none;margin-top:18px" onsubmit="saveInventoryFamily(event)"><input type="hidden" name="familyKey"><label class="wide">묶음 표시명<input name="familyLabel" placeholder="예: 718"></label><label class="wide">현재 묶인 강종<textarea name="members" readonly></textarea></label><div class="wide actions"><button class="btn primary" type="submit">묶음 이름 저장</button><button class="btn" type="button" onclick="this.form.style.display=\'none\'">취소</button></div></form><details style="margin-top:20px"><summary>원 강종을 다른 강종으로 직접 지정</summary><form id="inventoryGradeMappingForm" class="form-grid" onsubmit="saveInventoryGradeMapping(event)" style="margin-top:14px"><input type="hidden" name="id"><label class="wide">입항예정·미검수 원 강종<input name="sourceLabel" list="inventorySourceGrades" placeholder="예: IN 718 SOLIDS"><datalist id="inventorySourceGrades">'+sources.map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>품종<select name="productType"><option value="">품종 선택</option>'+['NI','TI','STS','CO','MO','CU','OTHER'].map(function(value){return'<option>'+value+'</option>';}).join('')+'</select></label><label>예상재고 강종<input name="mainGrade" list="inventoryTargetMain" placeholder="검색·직접입력"><datalist id="inventoryTargetMain">'+Array.from(new Set(candidates.map(function(row){return row.mainGrade;}))).map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>소강종<input name="subGrade" list="inventoryTargetSub" placeholder="선택 입력"><datalist id="inventoryTargetSub">'+Array.from(new Set(candidates.map(function(row){return row.subGrade;}).filter(Boolean))).map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>상세강종<input name="detailGrade" placeholder="선택 입력"></label><div class="wide actions"><button class="btn primary" type="submit">표기방식 저장</button><button class="btn" type="button" onclick="resetInventoryGradeMappingForm()">새로 입력</button></div></form><div id="inventoryGradeMappingList">'+mappingListHtml()+'</div></details>';
    root.$('modal').classList.add('on');
  };
  root.editInventoryFamily=function(key){
    var row=forecastRows().find(function(item){return item.isFamilySummary&&text(item.familyKey)===text(key);}),form=root.$('inventoryFamilyForm');if(!row||!form)return;
    form.style.display='grid';form.elements.familyKey.value=row.familyKey;form.elements.familyLabel.value=text(familyConfig(row.familyKey)&&familyConfig(row.familyKey).familyLabel)||text(row.mainGrade).replace(/\s*유사강종 예상재고\s*$/,'');form.elements.members.value=row.memberLabels.join('\n');form.scrollIntoView({behavior:'smooth',block:'center'});form.elements.familyLabel.focus();
  };
  root.saveInventoryFamily=async function(event){
    event.preventDefault();var data=new FormData(event.currentTarget),key=text(data.get('familyKey')),label=text(data.get('familyLabel'));if(!key||!label)return root.toast('묶음 표시명을 입력하세요.',true);
    var row={id:'family-'+key,kind:'FAMILY',familyKey:key,familyLabel:label,updatedAt:new Date().toISOString(),updatedByName:root.currentUserName()};
    var ok=await root.commit('유사강종 묶음 수정',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return !(text(item.familyKey)===key&&/^FAMILY/.test(upper(item.kind)));});next.inventoryGradeMappings.push(row);});
    if(ok){root.openInventoryGradeMapping();root.toast(label+' 유사강종 묶음 수정완료');}
  };
  root.deleteInventoryFamily=async function(key){
    var row=forecastRows().find(function(item){return item.isFamilySummary&&text(item.familyKey)===text(key);});if(!row||!confirm(row.mainGrade+' 묶음 합계행을 삭제할까요? 개별 강종 재고행은 유지됩니다.'))return;
    var exclusion={id:'family-exclusion-'+key,kind:'FAMILY_EXCLUSION',familyKey:key,familyLabel:text(row.mainGrade).replace(/\s*유사강종 예상재고\s*$/,''),updatedAt:new Date().toISOString(),updatedByName:root.currentUserName()};
    var ok=await root.commit('유사강종 묶음 삭제',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return text(item.familyKey)!==text(key);});next.inventoryGradeMappings.push(exclusion);});
    if(ok){root.openInventoryGradeMapping();root.toast('묶음 합계행을 삭제했습니다. 개별 강종 재고는 유지됩니다.');}
  };
  root.restoreInventoryFamily=async function(key){
    var ok=await root.commit('유사강종 묶음 복원',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return !(upper(item.kind)==='FAMILY_EXCLUSION'&&text(item.familyKey)===text(key));});});
    if(ok){root.openInventoryGradeMapping();root.toast('유사강종 묶음을 복원했습니다.');}
  };
  root.resetInventoryGradeMappingForm=function(){var form=root.$('inventoryGradeMappingForm');if(form)form.reset();};
  root.editInventoryGradeMapping=function(id){
    var row=mappingRows().find(function(item){return text(item.id)===text(id);}),form=root.$('inventoryGradeMappingForm');if(!row||!form)return;
    var target=row.target||row;form.elements.id.value=row.id;form.elements.sourceLabel.value=row.sourceLabel||row.sourceGrade||'';form.elements.productType.value=target.productType||'';form.elements.mainGrade.value=target.mainGrade||'';form.elements.subGrade.value=target.subGrade||'';form.elements.detailGrade.value=target.detailGrade||'';form.scrollIntoView({behavior:'smooth',block:'start'});
  };
  root.saveInventoryGradeMapping=async function(event){
    event.preventDefault();var form=event.currentTarget,data=new FormData(form),sourceLabel=text(data.get('sourceLabel')),mainGrade=text(data.get('mainGrade'));
    if(!sourceLabel||!mainGrade)return root.toast('원 강종과 예상재고 강종을 입력하세요.',true);
    var row={id:text(data.get('id'))||crypto.randomUUID(),sourceLabel:sourceLabel,target:{productType:text(data.get('productType')),mainGrade:mainGrade,subGrade:text(data.get('subGrade')),detailGrade:text(data.get('detailGrade'))},updatedAt:new Date().toISOString(),updatedByName:root.currentUserName()};
    var ok=await root.commit('재고표기 방식 저장',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return text(item.id)!==row.id&&normalize(item.sourceLabel||item.sourceGrade)!==normalize(sourceLabel);});next.inventoryGradeMappings.push(row);});
    if(ok){root.openInventoryGradeMapping();root.toast('재고표기 방식 저장완료 · 재고현황을 다시 계산했습니다.');}
  };
  root.deleteInventoryGradeMapping=async function(id){
    if(!confirm('선택한 재고표기 방식을 삭제할까요? 이후에는 70% 유사 기준으로 자동 계산합니다.'))return;
    var ok=await root.commit('재고표기 방식 삭제',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return text(item.id)!==text(id);});});
    if(ok)root.openInventoryGradeMapping();
  };

  function nextExpectedNo(){
    var day=new Date().toLocaleDateString('sv-SE').replace(/-/g,''),prefix='E-SO-'+day+'-';
    var max=list(root.state.expectedSalesOrders).reduce(function(value,row){var match=text(row.expectedSoNo).match(new RegExp('^'+prefix+'(\\d+)$'));return Math.max(value,match?number(match[1]):0);},0);
    return prefix+(max+1);
  }
  function expectedOrder(id){return list(root.state.expectedSalesOrders).find(function(row){return text(row.id)===text(id);});}
  function expectedFormValue(){
    var form=root.$('mesExpectedSoForm');if(!form)return null;var data=new FormData(form);
    return{id:text(data.get('id'))||crypto.randomUUID(),expectedSoNo:text(data.get('expectedSoNo'))||nextExpectedNo(),customer:text(data.get('customer')),productType:text(data.get('productType')),mainGrade:text(data.get('mainGrade')),subGrade:text(data.get('subGrade')),detailGrade:text(data.get('detailGrade')),weight:number(data.get('weight')),unitPrice:number(data.get('unitPrice')),currency:text(data.get('currency'))||'USD',memo:text(data.get('memo'))};
  }
  function expectedPreview(row){
    var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-number(row.weight));
    return'<div class="kpis mes-expected-preview"><div class="kpi"><small>현재 예상남은재고</small><strong>'+root.fmt(forecast.forecastRemaining)+' kg</strong></div><div class="kpi"><small>예상 S.O 중량</small><strong>'+root.fmt(row.weight)+' kg</strong></div><div class="kpi"><small>작성 후 예상남은재고</small><strong style="color:'+(remaining<0?'#b4232d':'#087566')+'">'+root.fmt(remaining)+' kg</strong></div><div class="kpi"><small>예상 판매금액</small><strong>'+root.fmt(number(row.weight)*number(row.unitPrice))+' '+encode(row.currency)+'</strong></div></div><p class="mes-mapping-note">재고 연결: '+encode(forecast.mapping||'자동 계산')+' · 입항예정·미검수·작업대기·미포장·완료재고 합계에서 S.O 출하예정량을 차감합니다.</p>';
  }
  function expectedSharedMarkup(row){
    var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-number(row.weight)),date=String(row.updatedAt||row.createdAt||'').slice(0,10)||'-';
    return'<div class="mes-expected-shared"><div class="detail-banner"><small>신성금속 예상 판매 견적</small><h2>'+encode(row.expectedSoNo)+'</h2><p>실제 판매·출하 재고와 분리된 예상 S.O입니다.</p></div><div class="detail-scroll"><table class="detail-table"><tbody><tr><th>작성일</th><td>'+encode(date)+'</td><th>판매처</th><td>'+encode(row.customer||'-')+'</td></tr><tr><th>강종</th><td colspan="3">'+encode(displayGrade(gradeParts(row)))+'</td></tr><tr><th>예상 중량</th><td>'+root.fmt(row.weight)+' kg</td><th>예상 단가</th><td>'+root.fmt(row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>예상 판매금액</th><td colspan="3">'+root.fmt(number(row.weight)*number(row.unitPrice))+' '+encode(row.currency)+'</td></tr><tr><th>메모</th><td colspan="3" style="white-space:pre-wrap">'+encode(row.memo||'')+'</td></tr></tbody></table></div>'+expectedPreview(row)+'<div class="actions"><button class="btn primary" data-id="'+encode(row.id)+'" onclick="printExpectedSo(this.dataset.id)">PDF 파일 만들기</button><button class="btn" data-id="'+encode(row.id)+'" onclick="shareExpectedSo(this.dataset.id)">카카오톡 공유</button><button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoComposer(this.dataset.id)">수정</button><button class="btn" onclick="closeModal()">닫기</button></div></div>';
  }
  root.openExpectedSoPreview=function(id){
    ensureState();var row=expectedOrder(id);if(!row)return false;
    root.$('modalTitle').textContent='예상 S.O 미리보기';root.$('modalBody').innerHTML=expectedSharedMarkup(row);root.$('modal').classList.add('on');return true;
  };
  root.refreshExpectedSoPreview=function(){var row=expectedFormValue(),target=root.$('mesExpectedSoPreview');if(row&&target)target.innerHTML=expectedPreview(row);};
  root.openExpectedSoComposer=function(id){
    ensureState();var saved=id&&expectedOrder(id),row=saved||{id:'',expectedSoNo:nextExpectedNo(),customer:'',productType:'',mainGrade:'',subGrade:'',detailGrade:'',weight:0,unitPrice:0,currency:'USD',memo:''};
    var mains=Array.from(new Set(finalCandidates().map(function(item){return item.mainGrade;}).filter(Boolean))),subs=Array.from(new Set(list(root.state.subGrades).concat(finalCandidates().map(function(item){return item.subGrade;})).filter(Boolean)));
    root.$('modalTitle').textContent=(saved?'예상 S.O 수정':'예상 S.O 작성')+' · 실제 판매와 별도 저장';
    root.$('modalBody').innerHTML='<form id="mesExpectedSoForm" class="form-grid" oninput="refreshExpectedSoPreview()" onchange="refreshExpectedSoPreview()"><input type="hidden" name="id" value="'+encode(row.id)+'"><label>예상 S.O 번호<input name="expectedSoNo" value="'+encode(row.expectedSoNo)+'"></label><label>판매처<input name="customer" value="'+encode(row.customer)+'" placeholder="판매처명"></label><label>품종<select name="productType"><option value="">품종 선택</option>'+['NI','TI','STS','CO','MO','CU','OTHER'].map(function(value){return'<option '+(value===row.productType?'selected':'')+'>'+value+'</option>';}).join('')+'</select></label><label>강종 검색·선택<input name="mainGrade" list="mesExpectedMainGrades" value="'+encode(row.mainGrade)+'" placeholder="저장 강종 검색"><datalist id="mesExpectedMainGrades">'+mains.map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>소강종 검색·선택<input name="subGrade" list="mesExpectedSubGrades" value="'+encode(row.subGrade)+'" placeholder="저장 소강종 검색"><datalist id="mesExpectedSubGrades">'+subs.map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>상세강종<input name="detailGrade" value="'+encode(row.detailGrade)+'" placeholder="선택 입력"></label><label>예상 판매중량(kg)<input name="weight" type="number" min="0" step="any" value="'+(row.weight||'')+'"></label><label>예상 단가<input name="unitPrice" type="number" min="0" step="any" value="'+(row.unitPrice||'')+'"></label><label>통화<select name="currency">'+['USD','KRW','EUR'].map(function(value){return'<option '+(value===row.currency?'selected':'')+'>'+value+'</option>';}).join('')+'</select></label><label class="wide">메모<textarea name="memo" placeholder="예상 판매 참고사항">'+encode(row.memo)+'</textarea></label><div id="mesExpectedSoPreview" class="wide">'+expectedPreview(row)+'</div><div class="wide actions"><button class="btn primary" type="button" onclick="saveExpectedSo()">전체저장</button><button class="btn" type="button" onclick="printExpectedSo()">PDF 파일 만들기</button><button class="btn" type="button" onclick="shareExpectedSo()">카카오톡 공유</button><button class="btn" type="button" onclick="openExpectedSoList()">예상 S.O 목록</button></div></form>';
    root.$('modal').classList.add('on');
  };
  root.saveExpectedSo=async function(){
    var row=expectedFormValue();if(!row||!row.mainGrade||row.weight<=0||row.unitPrice<0)return root.toast('강종·중량·가격을 확인하세요.',true);
    var existing=expectedOrder(row.id);row.createdAt=existing&&existing.createdAt||new Date().toISOString();row.updatedAt=new Date().toISOString();row.createdByName=existing&&existing.createdByName||root.currentUserName();row.amount=round(row.weight*row.unitPrice);row.status='ESTIMATE';
    var ok=await root.commit('예상 S.O 저장',['expectedSalesOrders'],function(next){next.expectedSalesOrders=list(next.expectedSalesOrders).filter(function(item){return text(item.id)!==row.id;});next.expectedSalesOrders.push(row);});
    if(ok){root.openExpectedSoComposer(row.id);root.toast('예상 S.O 저장완료 · 실제 판매·출하 재고에는 반영되지 않습니다.');}
  };
  function expectedPrintHtml(row){
    var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-row.weight);
    return'<!doctype html><html><head><meta charset="utf-8"><title>'+encode(row.expectedSoNo)+'</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#172433}h1{text-align:center}table{border-collapse:collapse;width:100%;margin-top:22px}th,td{border:1px solid #333;padding:10px;text-align:left}.summary{margin-top:22px;padding:16px;background:#eef7f5}.note{white-space:pre-wrap}</style></head><body><h1>ESTIMATED SALES ORDER</h1><table><tr><th>Expected S.O</th><td>'+encode(row.expectedSoNo)+'</td><th>Date</th><td>'+encode(String(row.updatedAt||row.createdAt||'').slice(0,10))+'</td></tr><tr><th>Customer</th><td colspan="3">'+encode(row.customer||'-')+'</td></tr><tr><th>Grade</th><td colspan="3">'+encode(displayGrade(gradeParts(row)))+'</td></tr><tr><th>Quantity</th><td>'+root.fmt(row.weight)+' kg</td><th>Unit Price</th><td>'+root.fmt(row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>Total</th><td colspan="3">'+root.fmt(row.weight*row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>Memo</th><td class="note" colspan="3">'+encode(row.memo||'')+'</td></tr></table><div class="summary"><b>재고 예상</b><p>현재 예상남은재고 '+root.fmt(forecast.forecastRemaining)+' kg → 작성 후 '+root.fmt(remaining)+' kg</p><p>본 예상 S.O는 실제 판매·출하 재고에 반영되지 않습니다.</p></div></body></html>';
  }
  root.printExpectedSo=function(id){var row=id?expectedOrder(id):expectedFormValue();if(!row)return;var popup=window.open('','_blank');if(!popup)return root.toast('팝업 차단을 해제해 주세요.',true);popup.document.open();popup.document.write(expectedPrintHtml(row));popup.document.close();setTimeout(function(){popup.focus();popup.print();},250);};
  root.shareExpectedSo=async function(id){
    var row=id?expectedOrder(id):expectedFormValue();if(!row)return;var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-row.weight),message='[신성금속 예상 S.O]\n'+row.expectedSoNo+'\n판매처: '+(row.customer||'-')+'\n강종: '+displayGrade(gradeParts(row))+'\n중량: '+root.fmt(row.weight)+' kg\n단가: '+root.fmt(row.unitPrice)+' '+row.currency+'\n작성 후 예상남은재고: '+root.fmt(remaining)+' kg\n※ 실제 판매·출하 재고에는 반영되지 않습니다.';
    var url=location.origin+location.pathname+'?expectedSo='+encodeURIComponent(row.id||'')+'#sales';
    if(!expectedOrder(row.id))return root.toast('카카오톡 공유 전에 예상 S.O를 전체저장해 주세요.',true);
    await shareMessage(row.expectedSoNo,message,url);
  };
  root.deleteExpectedSo=async function(id){if(!confirm('선택한 예상 S.O를 삭제할까요? 실제 판매자료에는 영향이 없습니다.'))return;var ok=await root.commit('예상 S.O 삭제',['expectedSalesOrders'],function(next){next.expectedSalesOrders=list(next.expectedSalesOrders).filter(function(row){return text(row.id)!==text(id);});});if(ok)root.openExpectedSoList();};
  root.openExpectedSoList=function(){
    ensureState();var rows=list(root.state.expectedSalesOrders).filter(active).sort(function(a,b){return text(b.updatedAt||b.createdAt).localeCompare(text(a.updatedAt||a.createdAt));});
    root.$('modalTitle').textContent='예상 S.O 목록 · 실제 판매와 분리';
    root.$('modalBody').innerHTML='<div class="actions" style="margin:14px 0"><button class="btn primary" onclick="openExpectedSoComposer()">+ 예상 S.O 새로 작성</button></div>'+(rows.length?'<div class="detail-scroll"><table class="detail-table"><thead><tr><th>번호</th><th>판매처</th><th>강종</th><th>중량</th><th>금액</th><th>작업</th></tr></thead><tbody>'+rows.map(function(row){return'<tr><td>'+encode(row.expectedSoNo)+'</td><td>'+encode(row.customer||'-')+'</td><td>'+encode(displayGrade(gradeParts(row)))+'</td><td>'+root.fmt(row.weight)+' kg</td><td>'+root.fmt(row.amount||row.weight*row.unitPrice)+' '+encode(row.currency)+'</td><td><button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoPreview(this.dataset.id)">미리보기</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoComposer(this.dataset.id)">수정</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="printExpectedSo(this.dataset.id)">PDF</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="shareExpectedSo(this.dataset.id)">카톡</button> <button class="btn danger" data-id="'+encode(row.id)+'" onclick="deleteExpectedSo(this.dataset.id)">삭제</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">저장된 예상 S.O가 없습니다.</div>');
    root.$('modal').classList.add('on');
  };
  function actualSalesForecastPreview(){
    var modal=root.$('modal'),body=root.$('modalBody');if(!modal||!modal.classList.contains('on')||!body||body.querySelector('#mesExpectedSoForm'))return;
    var title=text(root.$('modalTitle')&&root.$('modalTitle').textContent);if(!/판매|S\.O/.test(title))return;
    var main=body.querySelector('[name="mainGrade"]'),sub=body.querySelector('[name="subGrade"]'),type=body.querySelector('[name="productType"]'),weight=body.querySelector('[name="weight"]');if(!main)return;
    var forecast=forecastFor({productType:type&&type.value,mainGrade:main.value,subGrade:sub&&sub.value}),amount=number(weight&&weight.value),target=body.querySelector('#mesActualSalesForecastPreview');
    if(!target){target=document.createElement('div');target.id='mesActualSalesForecastPreview';target.className='wide mes-actual-forecast';var form=body.querySelector('form');if(form)form.appendChild(target);else body.appendChild(target);}
    target.innerHTML='<b>예상재고 자동연결</b><span>'+encode(forecast.gradeLabel||displayGrade(forecast))+' · 현재 예상남은 '+root.fmt(forecast.forecastRemaining)+' kg · 입력 후 '+root.fmt(forecast.forecastRemaining-amount)+' kg</span>';
  }
  function decorate(){
    ensureState();
    var actions=document.querySelector('#content .dashboard-head .actions');
    if(root.currentView==='inventory'&&actions&&!actions.querySelector('.mes-inventory-mapping'))actions.insertAdjacentHTML('afterbegin','<button class="btn mes-inventory-mapping" onclick="openInventoryGradeMapping()">재고표기 방식</button>');
    if(root.currentView==='sales'&&actions&&!actions.querySelector('.mes-expected-so'))actions.insertAdjacentHTML('afterbegin','<button class="btn primary mes-expected-so" onclick="openExpectedSoComposer()">+ 예상 S.O 작성하기</button><button class="btn mes-expected-so-list" onclick="openExpectedSoList()">예상 S.O 목록 '+list(root.state.expectedSalesOrders).filter(active).length+'건</button>');
    actualSalesForecastPreview();
    if(sharedExpectedSoId&&sharedExpectedSoOpened!==sharedExpectedSoId&&expectedOrder(sharedExpectedSoId)){sharedExpectedSoOpened=sharedExpectedSoId;requestAnimationFrame(function(){root.openExpectedSoPreview(sharedExpectedSoId);});}
  }
  function install(){
    if(!root.schemas||!root.schemas.inventory||document.documentElement.dataset.mesInventoryForecastSoV1==='ready')return;
    ensureState();
    var baseDefaults=root.defaults;root.defaults=function(value){var next=baseDefaults(value);if(!Array.isArray(next.expectedSalesOrders))next.expectedSalesOrders=[];if(!Array.isArray(next.inventoryGradeMappings))next.inventoryGradeMappings=[];return next;};
    root.schemas.inventory.rows=forecastRows;
    root.schemas.inventory.cols=[
      ['품종',function(row){return row.productType||'-';}],['강종',function(row){return row.mainGrade||'-';},'left'],['소강종',function(row){return row.subGrade||'-';}],
      ['입항예정재고(kg)',function(row){return root.fmt(row.arrival);}],['미검수재고(kg)',function(row){return root.fmt(row.uninspected);}],['작업대기재고(kg)',function(row){return root.fmt(row.workWaiting);} ],['미포장재고(kg)',function(row){return root.fmt(row.unpacked);}],
      ['완료재고(kg)',function(row){return root.fmt(row.completed);}],['유사강종 재고(kg)',function(row){return row.isFamilySummary?'<b>'+root.fmt(row.familyStock)+'</b>':root.fmt(row.expectedStock);}],['유사강종 출하예정(kg)',function(row){return root.fmt(row.shippingPlanned);}],
      ['유사강종 예상재고(kg)',function(row){return '<b style="color:'+(row.forecastRemaining<0?'#b4232d':'#087566')+'">'+root.fmt(row.forecastRemaining)+'</b>';}],['표기방식',function(row){return row.isFamilySummary?'묶음표기':'원문유지';}]
    ];
    var baseDetail=root.mesDetailMarkup;root.mesDetailMarkup=function(view,row){if(view==='inventory')return inventoryDetail(row);return baseDetail(view,row);};
    var baseRender=root.render;root.render=function(){var result=baseRender.apply(this,arguments);requestAnimationFrame(decorate);return result;};
    document.addEventListener('input',function(event){if(event.target&&/^(?:mainGrade|subGrade|productType|weight)$/.test(event.target.name||''))requestAnimationFrame(actualSalesForecastPreview);},true);
    document.documentElement.dataset.mesInventoryForecastSoV1='ready';
    root.mesForecastRows=forecastRows;root.mesResolveForecastGrade=resolveGrade;root.mesForecastForGrade=forecastFor;root.mesForecastSimilarity=similarity;root.mesForecastFamilyIdentity=familyIdentity;root.mesInventoryForecastVersion=VERSION;
    try{root.state=root.defaults(root.state);root.render();}catch(error){console.error('MES inventory forecast install failed',error);}
  }
  install();
})(window);
