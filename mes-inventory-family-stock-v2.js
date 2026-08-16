Exit code: 0
Wall time: 2.9 seconds
Total output lines: 531
Output:
(function(root){
  'use strict';

  var VERSION='20260816-pipeline-inventory-13';
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
  function active(row){
    if(!row||row.active===false||row.deleted===true||row.isDeleted===true||row.deletedAt)return false;
    return !/^(?:CANCELLED|DELETED|VOID|ARCHIVED)$/.test(upper(row.status));
  }
  function rowStamp(row){return Date.parse(row&&((row.updatedAt||row.savedAt||row.createdAt)||''))||0;}
  function currentRows(values){
    var byId=new Map(),withoutId=[];
    list(values).forEach(function(row){
      if(!active(row))return;
      var id=text(row.id);
      if(!id){withoutId.push(row);return;}
      var previous=byId.get(id);
      if(!previous||rowStamp(row)>=rowStamp(previous))byId.set(id,row);
    });
    return Array.from(byId.values()).concat(withoutId);
  }
  function round(value){return Math.round(number(value)*100)/100;}
  function encode(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}
  async function copyShareText(value){
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);return true;}}catch(_){ }
    try{var area=document.createElement('textarea');area.value=value;area.style.cssText='position:fixed;left:-9999px;top:-9999px';document.body.appendChild(area);area.focus();area.select();var copied=document.execCommand&&document.execCommand('copy');area.remove();return!!copied;}catch(_){return false;}
  }
  async function shareMessage(titleValue,message,url){
    var full=[message,url].filter(Boolean).join('\n');
    if(typeof root.mesShareText==='function')return root.mesShareText(titleValue,message,url);
    try{if(typeof navigator.share==='function'){await navigator.share({title:titleValue,text:message,url:url});return true;}}catch(error){if(error&&error.name==='AbortError')return false;}
    var copied=await copyShareText(full);
    root.toast(copied?'PC 怨듭쑀 以鍮꾩셿猷?쨌 移댁뭅?ㅽ넚 ??붿갹??遺숈뿬?ｌ쑝?몄슂.':'怨듭쑀臾멸뎄瑜??먮룞 蹂듭궗?섏? 紐삵뻽?듬땲?? ?ㅼ떆 ?쒕룄??二쇱꽭??',!copied);
    return copied;
  }
  function normalize(value){return upper(value).replace(/TURNINGS?/g,'TURNING').replace(/SOLIDS?/g,'SOLID').replace(/[^A-Z0-9媛-??/g,'');}
  function tokens(value){return upper(value).replace(/TURNINGS?/g,'TURNING').replace(/SOLIDS?/g,'SOLID').split(/[^A-Z0-9媛-??+/).filter(Boolean);}
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
    if(structuredMain)return [row.productType,structuredMain,row.subGrade,row.detailGrade].filter(Boolean).join(' 쨌 ');
    return text(row.grade||row.originalGrade||row.itemName);
  }
  function incomingGradeSource(row){
    var label=text(row&&(row.grade||row.originalGrade||row.itemName||row.description))||gradeLabel(row);
    return{grade:label,originalGrade:label};
  }
  function gradeParts(row){
    row=row||{};
    // A slash is part of many real alloy names (for example 70/30 COPPER and
    // 90/10 COPPER).  Treat only the visual separators as field delimiters.
    var label=gradeLabel(row),segments=label.split(/\s*[쨌|]\s*/).filter(Boolean);
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
  function displayGrade(parts){return[parts.productType,parts.mainGrade,parts.subGrade].filter(Boolean).join(' 쨌 ')||parts.label||'誘몃텇瑜?;}
  function ensureState(){
    if(!root.state)return;
    if(!Array.isArray(root.state.expectedSalesOrders))root.state.expectedSalesOrders=[];
    if(!Array.isArray(root.state.inventoryGradeMappings))root.state.inventoryGradeMappings=[];
  }
  function mappingRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&!/^FAMILY/.test(upper(row.kind));});}
  function familyConfigRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY';});}
  function familyExclusionRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY_EXCLUSION';});}
  function familyMemberExclusionRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY_MEMBER_EXCLUSION';});}
  function familyMemberAssignmentRows(){ensureState();return list(root.state&&root.state.inventoryGradeMappings).filter(function(row){return active(row)&&upper(row.kind)==='FAMILY_MEMBER_ASSIGNMENT';});}
  function familyMemberAssignment(row){return familyMemberAssignmentRows().find(function(item){return text(item.memberId)===text(row.id)||normalize(item.memberLabel)===normalize(row.gradeLabel);});}
  function familyMemberExcluded(key,row){return familyMemberExclusionRows().some(function(item){return text(item.familyKey)===text(key)&&(text(item.memberId)===text(row.id)||normalize(item.memberLabel)===normalize(row.gradeLabel));});}
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
    currentRows(root.state&&root.state.splits).forEach(add);
    currentRows(root.state&&root.state.bags).forEach(add);
    currentRows(root.state&&root.state.salesOrders).forEach(add);
    mappingRows().forEach(function(row){add(row.target||row);});
    return Array.from(map.values());
  }
  function resolveGrade(source){
    var sourceParts=gradeParts(source),sourceLabel=sourceParts.label||displayGrade(sourceParts),sourceNorm=normalize(sourceLabel);
    var manual=mappingRows().find(function(row){return normalize(row.sourceLabel||row.sourceGrade)===sourceNorm;});
    if(manual){
      var target=manual.target||manual;
      return Object.assign(gradeParts(target),{mapping:'吏곸젒 吏??,sourceLabel:sourceLabel,score:1});
    }
    var candidates=finalCandidates(),best=null;
    candidates.forEach(function(candidate){
      var score=Math.max(similarity(sourceLabel,candidate.label),similarity(sourceParts.mainGrade,candidate.mainGrade));
      if(!best||score>best.score)best={candidate:candidate,score:score};
    });
    if(best&&best.score>=.7)return Object.assign({},best.candidate,{mapping:'?먮룞 ?좎궗 '+Math.round(best.score*100)+'%',sourceLabel:sourceLabel,score:best.score});
    return Object.assign({},sourceParts,{mapping:'?먮Ц ?좎?',sourceLabel:sourceLabel,score:0});
  }
  function received(row){
    var status=upper(row&&row.receiptStatus);
    return !!(row&&(row.receivedAt||row.receiptConfirmedAt||row.receiptWorkerName||/RECEIVED|CONFIRMED|COMPLETE|DONE/.test(status)));
  }
  function packageWeight(row){return number(row&&((row.netWeight!=null&&row.netWeight!=='')?row.netWeight:row.weight));}
  function requestItemWeight(item){
    item=item||{};
    var candidates=[item.nw,item.netWeight,item.weight,item.gw,item.grossWeight];
    for(var i=0;i<candidates.length;i++){var value=number(candidates[i]);if(value>0)return value;}
    return 0;
  }
  function requestItemPackageNo(item){return text(item&&(item.internalPackageNo||item.packageNo||item.packNo));}
  function latestInboundRequests(){
    var latest=new Map();
    currentRows(root.state&&root.state.purchaseRequests).forEach(function(request){
      var key=text(request.poNo||request.requestNo||request.id),previous=latest.get(key);
      if(!previous||rowStamp(request)>=rowStamp(previous))latest.set(key,request);
    });
    return Array.from(latest.values());
  }
  // Inventory summary is a pipeline view.  It must survive completion-stock
  // deletion and package-row replacement, so requested PACKING LIST items are
  // used as the source of truth until receipt.  Active POS rows fill in all
  // other purchase/arrival records and provide receipt/inspection state.
  function incomingPipelineRows(){
    var allPos=list(root.state&&root.state.pos),activePos=currentRows(allPos).filter(function(row){return !row.inboundRequestSuperseded;});
    var posByPackage=new Map(),usedPackages=new Set(),rows=[];
    allPos.forEach(function(row){
      var no=text(row&&row.packageNo),previous=posByPackage.get(no);
      if(no&&(!previous||rowStamp(row)>=rowStamp(previous)))posByPackage.set(no,row);
    });
    latestInboundRequests().forEach(function(request){
      list(request.items).forEach(function(item,index){
        var packageNo=requestItemPackageNo(item),pos=packageNo&&posByPackage.get(packageNo),weight=requestItemWeight(item);
        if(pos&&active(pos)&&!pos.inboundRequestSuperseded){
          rows.push({row:pos,source:incomingGradeSource(pos),weight:packageWeight(pos)||weight,packageNo:text(pos.packageNo),received:received(pos)});
          usedPackages.add(text(pos.packageNo));
          return;
        }
        if(weight<=0)return;
        rows.push({
          row:Object.assign({},item,{id:text(item.id)||text(request.id)+':'+index,poNo:request.poNo,company:request.company,packageNo:packageNo,requestNo:request.requestNo,status:request.status,createdAt:request.createdAt,updatedAt:request.updatedAt}),
          source:incomingGradeSource(item),weight:weight,packageNo:packageNo,received:false
        });
        if(packageNo)usedPackages.add(packageNo);
      });
    });
    activePos.forEach(function(row){
      var packageNo=text(row.packageNo);
      if(packageNo&&usedPackages.has(packageNo))return;
      var weight=packageWeight(row);if(weight<=0)return;
      rows.push({row:row,source:incomingGradeSource(row),weight:weight,packageNo:packageNo,received:received(row)});
    });
    return rows;
  }
  function inspectedWeight(packageNo){
    var split=currentRows(root.state&&root.state.splits).filter(function(row){return text(row.packageNo)===text(packageNo);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    var loss=currentRows(root.state&&root.state.losses).filter(function(row){return text(row.packageNo)===text(packageNo);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    return split+loss;
  }
  function packedWeight(packageNo,grade){
    return currentRows(root.state&&root.state.inputs).filter(function(row){return text(row.packageNo)===text(packageNo)&&(!grade||text(row.grade)===text(grade));}).reduce(function(sum,row){return sum+number(row.weight);},0);
  }
  function activeWaitingRows(){
    var latest=new Map();
    currentRows(root.state&&root.state.waitingMoves).forEach(function(move){
      var key=text(move.packageNo)+'|'+text(move.grade||'*'),old=latest.get(key);
      if(!old||text(old.createdAt)<text(move.createdAt))latest.set(key,move);
    });
    return Array.from(latest.values()).map(function(move){
      var confirmed=currentRows(root.state&&root.state.splits).filter(function(row){return text(row.packageNo)===text(move.packageNo)&&text(row.grade)===text(move.grade);}).reduce(function(sum,row){return sum+number(row.weight);},0);
      var available=Math.max(0,confirmed-packedWeight(move.packageNo,move.grade));
      return{move:move,weight:Math.min(number(move.weight),available),grade:move.grade,packageNo:move.packageNo,location:move.to||''};
    }).filter(function(row){return row.weight>.0001;});
  }
  function activeWorkWaitingRows(){
    var rows=[];
    currentRows(root.state&&root.state.workWaits).filter(function(row){
      var status=upper(row&&row.status||row&&row.workStatus);
      return !/COMPLETE|COMPLETED|DONE|FINAL|FINISHED|CLOSED|DEPLETED/.test(status);
    }).forEach(function(row){
      var weights=row.settlementGradeWeights&&typeof row.settlementGradeWeights==='object'?row.settlementGradeWeights:null;
      if(weights){
        Object.keys(weights).forEach(function(grade){var weight=number(weights[grade]);if(weight>0)rows.push({grade:grade,weight:weight,record:row});});
        return;
      }
      var grade=text(gradeLabel(row)||row.grade||row.originalGrade),weight=number(row.remainingWeight||row.pendingWeight||row.weight);
      if(weight>0)rows.push({grade:grade||'誘몃텇瑜?,weight:weight,record:row});
    });
    return rows;
  }
  function shippedForItem(item){
    var shipments=currentRows(root.state&&root.state.shipments).filter(function(row){return text(row.salesOrderId)===text(item.id)||(row.soNo&&text(row.soNo)===text(item.soNo));});
    var ids=new Set(shipments.map(function(row){return text(row.id);}));
    var allocations=currentRows(root.state&&root.state.shipmentAllocations).filter(function(row){return ids.has(text(row.shipmentId))&&(!row.salesOrderId||text(row.salesOrderId)===text(item.id));});
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
      label=meaningful.slice(0,2).join(' ')||main||'誘몃텇瑜?;key=normalize(label);
    }
    return{key:key||normalize(main)||'誘몃텇瑜?,label:label||main||'誘몃텇瑜?};
  }
  function effectiveFamilyIdentity(row){
    var assigned=familyMemberAssignment(row);if(!assigned)return familyIdentity(row);
    return{key:text(assigned.familyKey),label:text(assigned.familyLabel||assigned.familyKey)||familyIdentity(row).label};
  }
  function familyConfig(key){return familyConfigRows().find(function(row){return text(row.familyKey)===text(key);});}
  function familyExcluded(key){return familyExclusionRows().some(function(row){return text(row.familyKey)===text(key);});}
  function detailGrade(source){
    var sourceParts=gradeParts(source),sourceLabel=sourceParts.label||displayGrade(sourceParts),sourceNorm=normalize(sourceLabel);
    var manual=mappingRows().find(function(row){return normalize(row.sourceLabel||row.sourceGrade)===sourceNorm;});
    if(manual){var target=manual.target||manual;return Object.assign(gradeParts(target),{mapping:'吏곸젒 吏??,sourceLabel:sourceLabel,score:1});}
    return Object.assign({},sourceParts,{mapping:'?먮Ц ?좎?',sourceLabel:sourceLabel,score:0});
  }
  function familySummaryRows(details){
    var families=new Map();
    details.forEach(function(row){
      var identity=effectiveFamilyIdentity(row),key=identity.key;
      if(!families.has(key))families.set(key,{key:key,label:identity.label,rows:[]});
      families.get(key).rows.push(row);
    });
    var summaries=[];
    families.forEach(function(family){
      family.rows=family.rows.filter(function(row){return !familyMemberExcluded(family.key,row);});
      var memberLabels=Array.from(new Set(family.rows.map(function(row){return row.gradeLabel;}).filter(Boolean)));
      if(memberLabels.length<2||familyExcluded(family.key))return;
      var config=familyConfig(family.key),label=text(config&&config.familyLabel)||family.label;
      var summary={id:'family:'+family.key,familyKey:family.key,isFamilySummary:true,productType:Array.from(new Set(family.rows.map(function(row){return row.productType;}).filter(Boolean))).join('/')||'-',mainGrade:label+' ?좎궗媛뺤쥌 ?덉긽?ш퀬',subGrade:memberLabels.length+'媛?媛뺤쥌',arrival:0,uninspected:0,workWaiting:0,unpacked:0,completed:0,shippingPlanned:0,sources:[],memberLabels:memberLabels,memberIds:family.rows.map(function(row){return row.id;}),members:family.rows,mapping:config?'?좎궗媛뺤쥌 吏곸젒 臾띠쓬':'?좎궗媛뺤쥌 ?먮룞 ?⑹궛'};
      family.rows.forEach(function(row){['arrival','uninspected','workWaiting','unpacked','completed','shippingPlanned'].forEach(function(stage){summary[stage]=round(summary[stage]+number(row[stage]));});summary.sources=summary.sources.concat(row.sources||[]);});
      summary.expectedStock=round(summary.arrival+summary.uninspected+summary.workWaiting+summary.unpacked+summary.completed);
      summary.familyStock=summary.expectedStock;summary.forecastRemaining=round(summary.familyStock-summary.shippingPlanned);summary.stock=summary.forecastRemaining;summary.gradeLabel=summary.mainGrade;
      summaries.push(summary);
    });
    return summaries;
  }
…5830 tokens truncated…d)===text(id);}),form=root.$('inventoryGradeMappingForm');if(!row||!form)return;
    var target=row.target||row;form.elements.id.value=row.id;form.elements.sourceLabel.value=row.sourceLabel||row.sourceGrade||'';form.elements.productType.value=target.productType||'';form.elements.mainGrade.value=target.mainGrade||'';form.elements.subGrade.value=target.subGrade||'';form.elements.detailGrade.value=target.detailGrade||'';form.scrollIntoView({behavior:'smooth',block:'start'});
  };
  root.saveInventoryGradeMapping=async function(event){
    event.preventDefault();var form=event.currentTarget,data=new FormData(form),sourceLabel=text(data.get('sourceLabel')),mainGrade=text(data.get('mainGrade'));
    if(!sourceLabel||!mainGrade)return root.toast('??媛뺤쥌怨??덉긽?ш퀬 媛뺤쥌???낅젰?섏꽭??',true);
    var row={id:text(data.get('id'))||crypto.randomUUID(),sourceLabel:sourceLabel,target:{productType:text(data.get('productType')),mainGrade:mainGrade,subGrade:text(data.get('subGrade')),detailGrade:text(data.get('detailGrade'))},updatedAt:new Date().toISOString(),updatedByName:root.currentUserName()};
    var ok=await root.commit('?ш퀬?쒓린 諛⑹떇 ???,['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return text(item.id)!==row.id&&normalize(item.sourceLabel||item.sourceGrade)!==normalize(sourceLabel);});next.inventoryGradeMappings.push(row);});
    if(ok){root.openInventoryGradeMapping();root.toast('?ш퀬?쒓린 諛⑹떇 ??μ셿猷?쨌 ?ш퀬?꾪솴???ㅼ떆 怨꾩궛?덉뒿?덈떎.');}
  };
  root.deleteInventoryGradeMapping=async function(id){
    if(!confirm('?좏깮???ш퀬?쒓린 諛⑹떇????젣?좉퉴?? ?댄썑?먮뒗 70% ?좎궗 湲곗??쇰줈 ?먮룞 怨꾩궛?⑸땲??'))return;
    var ok=await root.commit('?ш퀬?쒓린 諛⑹떇 ??젣',['inventoryGradeMappings'],function(next){next.inventoryGradeMappings=list(next.inventoryGradeMappings).filter(function(item){return text(item.id)!==text(id);});});
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
    return'<div class="kpis mes-expected-preview"><div class="kpi"><small>?꾩옱 ?덉긽?⑥??ш퀬</small><strong>'+root.fmt(forecast.forecastRemaining)+' kg</strong></div><div class="kpi"><small>?덉긽 S.O 以묐웾</small><strong>'+root.fmt(row.weight)+' kg</strong></div><div class="kpi"><small>?묒꽦 ???덉긽?⑥??ш퀬</small><strong style="color:'+(remaining<0?'#b4232d':'#087566')+'">'+root.fmt(remaining)+' kg</strong></div><div class="kpi"><small>?덉긽 ?먮ℓ湲덉븸</small><strong>'+root.fmt(number(row.weight)*number(row.unitPrice))+' '+encode(row.currency)+'</strong></div></div><p class="mes-mapping-note">?ш퀬 ?곌껐: '+encode(forecast.mapping||'?먮룞 怨꾩궛')+' 쨌 ?낇빆?덉젙쨌誘멸??샕룹옉?낅?湲걔룸??ъ옣쨌?꾨즺?ш퀬 ?⑷퀎?먯꽌 S.O 異쒗븯?덉젙?됱쓣 李④컧?⑸땲??</p>';
  }
  function expectedSharedMarkup(row){
    var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-number(row.weight)),date=String(row.updatedAt||row.createdAt||'').slice(0,10)||'-';
    return'<div class="mes-expected-shared"><div class="detail-banner"><small>?좎꽦湲덉냽 ?덉긽 ?먮ℓ 寃ъ쟻</small><h2>'+encode(row.expectedSoNo)+'</h2><p>?ㅼ젣 ?먮ℓ쨌異쒗븯 ?ш퀬? 遺꾨━???덉긽 S.O?낅땲??</p></div><div class="detail-scroll"><table class="detail-table"><tbody><tr><th>?묒꽦??/th><td>'+encode(date)+'</td><th>?먮ℓ泥?/th><td>'+encode(row.customer||'-')+'</td></tr><tr><th>媛뺤쥌</th><td colspan="3">'+encode(displayGrade(gradeParts(row)))+'</td></tr><tr><th>?덉긽 以묐웾</th><td>'+root.fmt(row.weight)+' kg</td><th>?덉긽 ?④?</th><td>'+root.fmt(row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>?덉긽 ?먮ℓ湲덉븸</th><td colspan="3">'+root.fmt(number(row.weight)*number(row.unitPrice))+' '+encode(row.currency)+'</td></tr><tr><th>硫붾え</th><td colspan="3" style="white-space:pre-wrap">'+encode(row.memo||'')+'</td></tr></tbody></table></div>'+expectedPreview(row)+'<div class="actions"><button class="btn primary" data-id="'+encode(row.id)+'" onclick="printExpectedSo(this.dataset.id)">PDF ?뚯씪 留뚮뱾湲?/button><button class="btn" data-id="'+encode(row.id)+'" onclick="shareExpectedSo(this.dataset.id)">移댁뭅?ㅽ넚 怨듭쑀</button><button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoComposer(this.dataset.id)">?섏젙</button><button class="btn" onclick="closeModal()">?リ린</button></div></div>';
  }
  root.openExpectedSoPreview=function(id){
    ensureState();var row=expectedOrder(id);if(!row)return false;
    root.$('modalTitle').textContent='?덉긽 S.O 誘몃━蹂닿린';root.$('modalBody').innerHTML=expectedSharedMarkup(row);root.$('modal').classList.add('on');return true;
  };
  root.refreshExpectedSoPreview=function(){var row=expectedFormValue(),target=root.$('mesExpectedSoPreview');if(row&&target)target.innerHTML=expectedPreview(row);};
  root.openExpectedSoComposer=function(id){
    ensureState();var saved=id&&expectedOrder(id),row=saved||{id:'',expectedSoNo:nextExpectedNo(),customer:'',productType:'',mainGrade:'',subGrade:'',detailGrade:'',weight:0,unitPrice:0,currency:'USD',memo:''};
    var mains=Array.from(new Set(finalCandidates().map(function(item){return item.mainGrade;}).filter(Boolean))),subs=Array.from(new Set(list(root.state.subGrades).concat(finalCandidates().map(function(item){return item.subGrade;})).filter(Boolean)));
    root.$('modalTitle').textContent=(saved?'?덉긽 S.O ?섏젙':'?덉긽 S.O ?묒꽦')+' 쨌 ?ㅼ젣 ?먮ℓ? 蹂꾨룄 ???;
    root.$('modalBody').innerHTML='<form id="mesExpectedSoForm" class="form-grid" oninput="refreshExpectedSoPreview()" onchange="refreshExpectedSoPreview()"><input type="hidden" name="id" value="'+encode(row.id)+'"><label>?덉긽 S.O 踰덊샇<input name="expectedSoNo" value="'+encode(row.expectedSoNo)+'"></label><label>?먮ℓ泥?input name="customer" value="'+encode(row.customer)+'" placeholder="?먮ℓ泥섎챸"></label><label>?덉쥌<select name="productType"><option value="">?덉쥌 ?좏깮</option>'+['NI','TI','STS','CO','MO','CU','OTHER'].map(function(value){return'<option '+(value===row.productType?'selected':'')+'>'+value+'</option>';}).join('')+'</select></label><label>媛뺤쥌 寃?됀룹꽑??input name="mainGrade" list="mesExpectedMainGrades" value="'+encode(row.mainGrade)+'" placeholder="???媛뺤쥌 寃??><datalist id="mesExpectedMainGrades">'+mains.map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>?뚭컯醫?寃?됀룹꽑??input name="subGrade" list="mesExpectedSubGrades" value="'+encode(row.subGrade)+'" placeholder="????뚭컯醫?寃??><datalist id="mesExpectedSubGrades">'+subs.map(function(value){return'<option value="'+encode(value)+'"></option>';}).join('')+'</datalist></label><label>?곸꽭媛뺤쥌<input name="detailGrade" value="'+encode(row.detailGrade)+'" placeholder="?좏깮 ?낅젰"></label><label>?덉긽 ?먮ℓ以묐웾(kg)<input name="weight" type="number" min="0" step="any" value="'+(row.weight||'')+'"></label><label>?덉긽 ?④?<input name="unitPrice" type="number" min="0" step="any" value="'+(row.unitPrice||'')+'"></label><label>?듯솕<select name="currency">'+['USD','KRW','EUR'].map(function(value){return'<option '+(value===row.currency?'selected':'')+'>'+value+'</option>';}).join('')+'</select></label><label class="wide">硫붾え<textarea name="memo" placeholder="?덉긽 ?먮ℓ 李멸퀬?ы빆">'+encode(row.memo)+'</textarea></label><div id="mesExpectedSoPreview" class="wide">'+expectedPreview(row)+'</div><div class="wide actions"><button class="btn primary" type="button" onclick="saveExpectedSo()">?꾩껜???/button><button class="btn" type="button" onclick="printExpectedSo()">PDF ?뚯씪 留뚮뱾湲?/button><button class="btn" type="button" onclick="shareExpectedSo()">移댁뭅?ㅽ넚 怨듭쑀</button><button class="btn" type="button" onclick="openExpectedSoList()">?덉긽 S.O 紐⑸줉</button></div></form>';
    root.$('modal').classList.add('on');
  };
  root.saveExpectedSo=async function(){
    var row=expectedFormValue();if(!row||!row.mainGrade||row.weight<=0||row.unitPrice<0)return root.toast('媛뺤쥌쨌以묐웾쨌媛寃⑹쓣 ?뺤씤?섏꽭??',true);
    var existing=expectedOrder(row.id);row.createdAt=existing&&existing.createdAt||new Date().toISOString();row.updatedAt=new Date().toISOString();row.createdByName=existing&&existing.createdByName||root.currentUserName();row.amount=round(row.weight*row.unitPrice);row.status='ESTIMATE';
    var ok=await root.commit('?덉긽 S.O ???,['expectedSalesOrders'],function(next){next.expectedSalesOrders=list(next.expectedSalesOrders).filter(function(item){return text(item.id)!==row.id;});next.expectedSalesOrders.push(row);});
    if(ok){root.openExpectedSoComposer(row.id);root.toast('?덉긽 S.O ??μ셿猷?쨌 ?ㅼ젣 ?먮ℓ쨌異쒗븯 ?ш퀬?먮뒗 諛섏쁺?섏? ?딆뒿?덈떎.');}
  };
  function expectedPrintHtml(row){
    var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-row.weight);
    return'<!doctype html><html><head><meta charset="utf-8"><title>'+encode(row.expectedSoNo)+'</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#172433}h1{text-align:center}table{border-collapse:collapse;width:100%;margin-top:22px}th,td{border:1px solid #333;padding:10px;text-align:left}.summary{margin-top:22px;padding:16px;background:#eef7f5}.note{white-space:pre-wrap}</style></head><body><h1>ESTIMATED SALES ORDER</h1><table><tr><th>Expected S.O</th><td>'+encode(row.expectedSoNo)+'</td><th>Date</th><td>'+encode(String(row.updatedAt||row.createdAt||'').slice(0,10))+'</td></tr><tr><th>Customer</th><td colspan="3">'+encode(row.customer||'-')+'</td></tr><tr><th>Grade</th><td colspan="3">'+encode(displayGrade(gradeParts(row)))+'</td></tr><tr><th>Quantity</th><td>'+root.fmt(row.weight)+' kg</td><th>Unit Price</th><td>'+root.fmt(row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>Total</th><td colspan="3">'+root.fmt(row.weight*row.unitPrice)+' '+encode(row.currency)+'</td></tr><tr><th>Memo</th><td class="note" colspan="3">'+encode(row.memo||'')+'</td></tr></table><div class="summary"><b>?ш퀬 ?덉긽</b><p>?꾩옱 ?덉긽?⑥??ш퀬 '+root.fmt(forecast.forecastRemaining)+' kg ???묒꽦 ??'+root.fmt(remaining)+' kg</p><p>蹂??덉긽 S.O???ㅼ젣 ?먮ℓ쨌異쒗븯 ?ш퀬??諛섏쁺?섏? ?딆뒿?덈떎.</p></div></body></html>';
  }
  root.printExpectedSo=function(id){var row=id?expectedOrder(id):expectedFormValue();if(!row)return;var popup=window.open('','_blank');if(!popup)return root.toast('?앹뾽 李⑤떒???댁젣??二쇱꽭??',true);popup.document.open();popup.document.write(expectedPrintHtml(row));popup.document.close();setTimeout(function(){popup.focus();popup.print();},250);};
  root.shareExpectedSo=async function(id){
    var row=id?expectedOrder(id):expectedFormValue();if(!row)return;var forecast=forecastFor(row),remaining=round(forecast.forecastRemaining-row.weight),message='[?좎꽦湲덉냽 ?덉긽 S.O]\n'+row.expectedSoNo+'\n?먮ℓ泥? '+(row.customer||'-')+'\n媛뺤쥌: '+displayGrade(gradeParts(row))+'\n以묐웾: '+root.fmt(row.weight)+' kg\n?④?: '+root.fmt(row.unitPrice)+' '+row.currency+'\n?묒꽦 ???덉긽?⑥??ш퀬: '+root.fmt(remaining)+' kg\n???ㅼ젣 ?먮ℓ쨌異쒗븯 ?ш퀬?먮뒗 諛섏쁺?섏? ?딆뒿?덈떎.';
    var url=location.origin+location.pathname+'?expectedSo='+encodeURIComponent(row.id||'')+'#sales';
    if(!expectedOrder(row.id))return root.toast('移댁뭅?ㅽ넚 怨듭쑀 ?꾩뿉 ?덉긽 S.O瑜??꾩껜??ν빐 二쇱꽭??',true);
    await shareMessage(row.expectedSoNo,message,url);
  };
  root.deleteExpectedSo=async function(id){if(!confirm('?좏깮???덉긽 S.O瑜???젣?좉퉴?? ?ㅼ젣 ?먮ℓ?먮즺?먮뒗 ?곹뼢???놁뒿?덈떎.'))return;var ok=await root.commit('?덉긽 S.O ??젣',['expectedSalesOrders'],function(next){next.expectedSalesOrders=list(next.expectedSalesOrders).filter(function(row){return text(row.id)!==text(id);});});if(ok)root.openExpectedSoList();};
  root.openExpectedSoList=function(){
    ensureState();var rows=list(root.state.expectedSalesOrders).filter(active).sort(function(a,b){return text(b.updatedAt||b.createdAt).localeCompare(text(a.updatedAt||a.createdAt));});
    root.$('modalTitle').textContent='?덉긽 S.O 紐⑸줉 쨌 ?ㅼ젣 ?먮ℓ? 遺꾨━';
    root.$('modalBody').innerHTML='<div class="actions" style="margin:14px 0"><button class="btn primary" onclick="openExpectedSoComposer()">+ ?덉긽 S.O ?덈줈 ?묒꽦</button></div>'+(rows.length?'<div class="detail-scroll"><table class="detail-table"><thead><tr><th>踰덊샇</th><th>?먮ℓ泥?/th><th>媛뺤쥌</th><th>以묐웾</th><th>湲덉븸</th><th>?묒뾽</th></tr></thead><tbody>'+rows.map(function(row){return'<tr><td>'+encode(row.expectedSoNo)+'</td><td>'+encode(row.customer||'-')+'</td><td>'+encode(displayGrade(gradeParts(row)))+'</td><td>'+root.fmt(row.weight)+' kg</td><td>'+root.fmt(row.amount||row.weight*row.unitPrice)+' '+encode(row.currency)+'</td><td><button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoPreview(this.dataset.id)">誘몃━蹂닿린</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="openExpectedSoComposer(this.dataset.id)">?섏젙</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="printExpectedSo(this.dataset.id)">PDF</button> <button class="btn" data-id="'+encode(row.id)+'" onclick="shareExpectedSo(this.dataset.id)">移댄넚</button> <button class="btn danger" data-id="'+encode(row.id)+'" onclick="deleteExpectedSo(this.dataset.id)">??젣</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">??λ맂 ?덉긽 S.O媛 ?놁뒿?덈떎.</div>');
    root.$('modal').classList.add('on');
  };
  function actualSalesForecastPreview(){
    var modal=root.$('modal'),body=root.$('modalBody');if(!modal||!modal.classList.contains('on')||!body||body.querySelector('#mesExpectedSoForm'))return;
    var title=text(root.$('modalTitle')&&root.$('modalTitle').textContent);if(!/?먮ℓ|S\.O/.test(title))return;
    var main=body.querySelector('[name="mainGrade"]'),sub=body.querySelector('[name="subGrade"]'),type=body.querySelector('[name="productType"]'),weight=body.querySelector('[name="weight"]');if(!main)return;
    var forecast=forecastFor({productType:type&&type.value,mainGrade:main.value,subGrade:sub&&sub.value}),amount=number(weight&&weight.value),target=body.querySelector('#mesActualSalesForecastPreview');
    if(!target){target=document.createElement('div');target.id='mesActualSalesForecastPreview';target.className='wide mes-actual-forecast';var form=body.querySelector('form');if(form)form.appendChild(target);else body.appendChild(target);}
    target.innerHTML='<b>?덉긽?ш퀬 ?먮룞?곌껐</b><span>'+encode(forecast.gradeLabel||displayGrade(forecast))+' 쨌 ?꾩옱 ?덉긽?⑥? '+root.fmt(forecast.forecastRemaining)+' kg 쨌 ?낅젰 ??'+root.fmt(forecast.forecastRemaining-amount)+' kg</span>';
  }
  function decorate(){
    ensureState();
    var actions=document.querySelector('#content .dashboard-head .actions');
    if(root.currentView==='inventory'&&actions&&!actions.querySelector('.mes-inventory-mapping'))actions.insertAdjacentHTML('afterbegin','<button class="btn mes-inventory-mapping" onclick="openInventoryGradeMapping()">?ш퀬?쒓린 諛⑹떇</button>');
    if(root.currentView==='sales'&&actions&&!actions.querySelector('.mes-expected-so'))actions.insertAdjacentHTML('afterbegin','<button class="btn primary mes-expected-so" onclick="openExpectedSoComposer()">+ ?덉긽 S.O ?묒꽦?섍린</button><button class="btn mes-expected-so-list" onclick="openExpectedSoList()">?덉긽 S.O 紐⑸줉 '+list(root.state.expectedSalesOrders).filter(active).length+'嫄?/button>');
    actualSalesForecastPreview();
    if(sharedExpectedSoId&&sharedExpectedSoOpened!==sharedExpectedSoId&&expectedOrder(sharedExpectedSoId)){sharedExpectedSoOpened=sharedExpectedSoId;requestAnimationFrame(function(){root.openExpectedSoPreview(sharedExpectedSoId);});}
  }
  function install(){
    if(!root.schemas||!root.schemas.inventory||document.documentElement.dataset.mesInventoryForecastSoV1==='ready')return;
    ensureState();
    var baseDefaults=root.defaults;root.defaults=function(value){var next=baseDefaults(value);if(!Array.isArray(next.expectedSalesOrders))next.expectedSalesOrders=[];if(!Array.isArray(next.inventoryGradeMappings))next.inventoryGradeMappings=[];return next;};
    root.schemas.inventory.rows=forecastRows;
    root.schemas.inventory.cols=[
      ['?덉쥌',function(row){return row.productType||'-';}],['媛뺤쥌',function(row){return row.mainGrade||'-';},'left'],['?뚭컯醫?,function(row){return row.subGrade||'-';}],
      ['?낇빆?덉젙?ш퀬(kg)',function(row){return root.fmt(row.arrival);}],['誘멸??섏옱怨?kg)',function(row){return root.fmt(row.uninspected);}],['?묒뾽?湲곗옱怨?kg)',function(row){return root.fmt(row.workWaiting);} ],['誘명룷?μ옱怨?kg)',function(row){return root.fmt(row.unpacked);}],
      ['?꾨즺?ш퀬(kg)',function(row){return root.fmt(row.completed);}],['?좎궗媛뺤쥌 ?ш퀬(kg)',function(row){return row.isFamilySummary?'<b>'+root.fmt(row.familyStock)+'</b>':root.fmt(row.expectedStock);}],['?좎궗媛뺤쥌 異쒗븯?덉젙(kg)',function(row){return root.fmt(row.shippingPlanned);}],
      ['?좎궗媛뺤쥌 ?덉긽?ш퀬(kg)',function(row){return '<b style="color:'+(row.forecastRemaining<0?'#b4232d':'#087566')+'">'+root.fmt(row.forecastRemaining)+'</b>';}],['?쒓린諛⑹떇',function(row){return row.isFamilySummary?'臾띠쓬?쒓린':'?먮Ц?좎?';}]
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

