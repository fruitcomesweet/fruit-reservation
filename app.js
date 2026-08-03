const CFG=window.FRUIT_CONFIG||{};
const ONLINE=Boolean(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&window.supabase);
const db=ONLINE?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;
const LS={products:'fruitFormal_products',orders:'fruitFormal_orders',settings:'fruitFormal_settings'};
const defaults={products:[{id:'mango',name:'金煌芒果',unit:'斤',price:33,stock:60,emoji:'🥭',description:'特A級，保留需最少3斤',active:true,sort_order:1},{id:'durian',name:'赤皇榴槤',unit:'顆',price:499,stock:20,emoji:'🌰',description:'明星牌特A果，單顆販售',active:true,sort_order:2},{id:'dragon',name:'白肉火龍果',unit:'斤',price:39,stock:90,emoji:'🐉',description:'清甜爽口，限量供應',active:true,sort_order:3}],settings:{location:'📍 板橋重慶黃昏市場',hours:'取貨時間 14:00–19:30｜商品限當日取貨',open:true}};
let products=[],orders=[],settings={},cart={},adminSession=null,currentStaff=null,staffMembers=[];
const $=id=>document.getElementById(id),money=n=>`$${Number(n).toLocaleString('zh-TW')}`,clone=x=>JSON.parse(JSON.stringify(x));
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??clone(f)}catch{return clone(f)}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}
async function init(){
 $('todayText').textContent=new Intl.DateTimeFormat('zh-TW',{month:'long',day:'numeric',weekday:'short'}).format(new Date())+'｜每日新鮮上架';
 $('onlineBadge').textContent=ONLINE?'雲端同步':'設定未完成'; $('onlineBadge').style.background=ONLINE?'#eef6ef':'#fff1db';
 if(!ONLINE) alert('Supabase 連線設定尚未完成，網站不能正式使用。');
 await refreshAll();bind();
 if(ONLINE){const {data}=await db.auth.getSession();adminSession=data.session||null;if(adminSession)await loadCurrentStaff();updateAdminView();db.auth.onAuthStateChange(async(_event,session)=>{adminSession=session;currentStaff=null;if(session)await loadCurrentStaff();updateAdminView();});}
 if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
async function refreshAll(){
 if(ONLINE){
  const [p,s]=await Promise.all([db.from('products').select('*').order('sort_order'),db.from('store_settings').select('*').eq('id',1).maybeSingle()]);
  if(p.error||s.error){console.error(p.error||s.error);alert('雲端讀取失敗，請稍後再試。');products=[];settings=clone(defaults.settings)}
  else{products=p.data||[];settings=s.data||clone(defaults.settings)}
 }else loadLocal();
 applySettings();renderProducts();renderCart();
}
async function refreshAdminOrders(){
 if(!ONLINE||!adminSession){orders=[];return;}
 const o=await db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false});
 if(o.error){console.error(o.error);alert('訂單讀取失敗，請確認已執行新版權限 SQL。');orders=[];return;}
 orders=(o.data||[]).map(x=>({...x,items:x.order_items||[]}));
}
function loadLocal(){products=load(LS.products,defaults.products);orders=load(LS.orders,[]);settings=load(LS.settings,defaults.settings)}
function applySettings(){$('storeLocation').textContent=settings.location;$('storeHours').textContent=settings.hours;$('openStatus').textContent=settings.open?'預約開放中':'目前暫停預約';$('settingLocation').value=settings.location;$('settingHours').value=settings.hours;$('settingOpen').value=String(settings.open)}
function renderProducts(){const visible=products.filter(p=>p.active);$('emptyProducts').classList.toggle('hidden',visible.length);$('productGrid').innerHTML=visible.map(p=>{const q=cart[p.id]||0,sold=p.stock<=0;return `<article class="product ${sold?'sold':''}"><div class="product-icon">${esc(p.emoji||'🍎')}</div><h3>${esc(p.name)}</h3><div class="product-desc">${esc(p.description||'')}</div><div class="meta"><span class="price">${money(p.price)} / ${esc(p.unit)}</span><span class="stock">${sold?'已售完':`剩 ${p.stock} ${esc(p.unit)}`}</span></div><div class="qty"><button data-dec="${p.id}" ${sold?'disabled':''}>−</button><strong>${q}</strong><button data-inc="${p.id}" ${sold?'disabled':''}>＋</button></div></article>`}).join('');document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>changeQty(b.dataset.inc,1));document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>changeQty(b.dataset.dec,-1));}
function changeQty(id,d){const p=products.find(x=>String(x.id)===String(id));const n=Math.max(0,Math.min(p.stock,(cart[id]||0)+d));if(n)cart[id]=n;else delete cart[id];renderProducts();renderCart()}
function renderCart(){const lines=Object.entries(cart).map(([id,q])=>({p:products.find(x=>String(x.id)===String(id)),q})).filter(x=>x.p);const total=lines.reduce((s,x)=>s+x.p.price*x.q,0);$('cartCount').textContent=lines.length?`${lines.reduce((s,x)=>s+x.q,0)} 件商品`:'尚未選商品';$('cartSummary').innerHTML=lines.length?lines.map(x=>`<div class="cart-line"><span>${esc(x.p.emoji)} ${esc(x.p.name)} × ${x.q}</span><strong>${money(x.p.price*x.q)}</strong></div>`).join('')+`<div class="cart-line cart-total"><span>商品小計</span><span>${money(total)}</span></div>`:'請先選擇上方商品。'}
$('logoutAdmin').onclick=logout;
$('changePassword').onclick=openPasswordDialog;
$('closePasswordDialog').onclick=closePasswordDialog;
$('cancelPasswordChange').onclick=closePasswordDialog;
$('passwordForm').onsubmit=changePassword;async function submitOrder(e){e.preventDefault();$('formMessage').textContent='';if(!settings.open)return fail('目前暫停預約。');const entries=Object.entries(cart);if(!entries.length)return fail('請先選擇至少一項商品。');const name=$('name').value.trim(),phone=$('phone').value.trim(),pickup=$('pickupTime').value,method=document.querySelector('input[name="method"]:checked').value,address=$('address').value.trim();if(!name||!/^09\d{8}$/.test(phone)||!pickup||!$('agree').checked)return fail('請確認姓名、10碼手機、取貨時間與同意事項。');if(method==='Lalamove配送'&&!address)return fail('請填寫配送地址。');const items=entries.map(([id,qty])=>{const p=products.find(x=>String(x.id)===String(id));return{product_id:p.id,name:p.name,unit:p.unit,price:p.price,qty,emoji:p.emoji}});for(const i of items){const p=products.find(x=>String(x.id)===String(i.product_id));if(!p||i.qty>p.stock)return fail(`${i.name} 庫存不足。`)}const total=items.reduce((s,i)=>s+i.price*i.qty,0),status=method==='Lalamove配送'?'等待報價':'未取';let order;
function openPasswordDialog() {
  $('passwordForm').reset();
  $('passwordMessage').textContent = '';
  $('submitPasswordChange').disabled = false;
  $('submitPasswordChange').textContent = '確認修改';
  $('passwordDialog').showModal();

  setTimeout(() => {
    $('currentPassword').focus();
  }, 100);
}

function closePasswordDialog() {
  $('passwordDialog').close();
  $('passwordForm').reset();
  $('passwordMessage').textContent = '';
}

async function changePassword(event) {
  event.preventDefault();

  if (!ONLINE || !adminSession) {
    $('passwordMessage').textContent = '登入狀態已失效，請重新登入。';
    return;
  }

  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmPassword = $('confirmNewPassword').value;
  const email = adminSession.user?.email;

  $('passwordMessage').textContent = '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    $('passwordMessage').textContent = '請完整填寫三個密碼欄位。';
    return;
  }

  if (newPassword.length < 8) {
    $('passwordMessage').textContent = '新密碼至少需要 8 碼。';
    return;
  }

  if (newPassword !== confirmPassword) {
    $('passwordMessage').textContent = '兩次輸入的新密碼不一致。';
    return;
  }

  if (currentPassword === newPassword) {
    $('passwordMessage').textContent = '新密碼不能與目前密碼相同。';
    return;
  }

  if (!email) {
    $('passwordMessage').textContent = '找不到目前登入的 Email。';
    return;
  }

  const button = $('submitPasswordChange');
  button.disabled = true;
  button.textContent = '修改中…';

  try {
    // 先用目前密碼重新驗證
    const { error: signInError } = await db.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (signInError) {
      $('passwordMessage').textContent = '目前密碼不正確。';
      return;
    }

    // 更新為新密碼
    const { error: updateError } = await db.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      throw updateError;
    }

    $('passwordMessage').textContent = '密碼修改成功！';

    setTimeout(() => {
      closePasswordDialog();
      alert('密碼已修改成功，請妥善保管新密碼。');
    }, 700);

  } catch (error) {
    console.error(error);

    $('passwordMessage').textContent =
      error instanceof Error
        ? `修改失敗：${error.message}`
        : '修改密碼時發生未知錯誤。';
  } finally {
    button.disabled = false;
    button.textContent = '確認修改';
  }
}
try{if(ONLINE){const rpc=await db.rpc('create_reservation',{p_name:name,p_phone:phone,p_line_name:$('lineName').value.trim(),p_pickup_time:pickup,p_method:method,p_address:address,p_note:$('note').value.trim(),p_status:status,p_items:items});if(rpc.error)throw rpc.error;order={...rpc.data,items}}else{const id=`GL${new Date().toISOString().slice(5,10).replace('-','')}-${String(orders.length+1).padStart(3,'0')}`;order={id,created_at:new Date().toISOString(),name,phone,line_name:$('lineName').value.trim(),pickup_time:pickup,method,address,note:$('note').value.trim(),status,total,items};orders.unshift(order);if(method==='現場自取')items.forEach(i=>products.find(p=>String(p.id)===String(i.product_id)).stock-=i.qty);save(LS.orders,orders);save(LS.products,products)}}catch(err){console.error(err);return fail('送出失敗，請稍後再試或聯絡小編。')}
 showSuccess(order);cart={};e.target.reset();document.querySelector('input[value="現場自取"]').checked=true;$('deliveryFields').classList.add('hidden');await refreshAll();}
function fail(t){$('formMessage').textContent=t}
function showSuccess(o){$('successContent').innerHTML=`<div style="font-size:48px;text-align:center">🍊</div><h2 style="text-align:center">已收到預約</h2><p style="text-align:center">請截圖保留此畫面</p><div class="success-number">${esc(o.id)}</div>${o.items.map(i=>`<div class="cart-line"><span>${esc(i.emoji)} ${esc(i.name)} × ${i.qty}</span><strong>${money(i.price*i.qty)}</strong></div>`).join('')}<div class="cart-line cart-total"><span>商品小計</span><span>${money(o.total)}</span></div><div class="cart-line"><span>取貨</span><span>${esc(o.pickup_time||o.pickup)}／${esc(o.method)}</span></div><div class="cart-line"><span>狀態</span><span>${esc(o.status)}</span></div><p class="helper">到現場請提供預約編號或手機末三碼。</p>`;$('successDialog').showModal()}
async function unlock(){
 if(!ONLINE)return alert('Supabase 尚未連線，無法登入。');
 const email=$('adminEmail').value.trim(),password=$('adminPassword').value;
 $('loginMessage').textContent='';
 if(!email||!password){$('loginMessage').textContent='請輸入 Email 和密碼。';return;}
 $('unlockAdmin').disabled=true;$('unlockAdmin').textContent='登入中…';
 const {data,error}=await db.auth.signInWithPassword({email,password});
 $('unlockAdmin').disabled=false;$('unlockAdmin').textContent='登入後台';
 if(error){$('loginMessage').textContent='登入失敗，請確認帳號與密碼。';return;}
 adminSession=data.session;await loadCurrentStaff();if(!currentStaff||!currentStaff.is_active){await db.auth.signOut();adminSession=null;$('loginMessage').textContent='此帳號尚未加入員工名單，或目前已停用。';updateAdminView();return;}updateAdminView();await refreshAdminOrders();renderAdmin();
}
async function logout(){if(ONLINE)await db.auth.signOut();adminSession=null;currentStaff=null;staffMembers=[];orders=[];updateAdminView();}
function updateAdminView(){
 const logged=Boolean(adminSession);
 $('adminLock').classList.toggle('hidden',logged);$('adminPanel').classList.toggle('hidden',!logged);
 if(logged){$('adminUserEmail').textContent=`${currentStaff?.display_name||''} ${adminSession.user.email||'已登入'}`.trim();$('loginMessage').textContent='';applyRoleUI();}
}
function switchTab(tab){if(tab==='staff'&&currentStaff?.role!=='owner')return;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));['orders','products','staff','settings'].forEach(x=>$(x+'Panel').classList.toggle('hidden',x!==tab));renderAdmin()}
function renderAdmin(){renderStats();renderOrders();renderProductAdmin();applySettings();if(currentStaff?.role==='owner')refreshStaff().then(renderStaff)}
function renderStats(){const revenue=orders.filter(o=>o.status==='已取').reduce((s,o)=>s+Number(o.total),0);$('stats').innerHTML=`<div class="stat"><strong>${orders.length}</strong><span>今日訂單</span></div><div class="stat"><strong>${orders.filter(o=>o.status==='未取').length}</strong><span>尚未取貨</span></div><div class="stat"><strong>${orders.filter(o=>o.status==='等待報價').length}</strong><span>等待報價</span></div><div class="stat"><strong>${money(revenue)}</strong><span>已取營業額</span></div>`}
function renderOrders(){const f=$('statusFilter').value,q=$('orderSearch').value.trim().toLowerCase(),list=orders.filter(o=>(f==='all'||o.status===f)&&(!q||`${o.id}${o.name}${o.phone}`.toLowerCase().includes(q)));$('orderList').innerHTML=list.length?list.map(o=>`<article class="order-item"><div class="order-top"><div><strong>${esc(o.name)}</strong><div class="order-id">${esc(o.phone)}｜${esc(o.id)}</div></div><span class="status-badge">${esc(o.status)}</span></div><div class="order-lines">${(o.items||[]).map(i=>`${esc(i.emoji)} ${esc(i.name)} × ${i.qty}`).join('、')}<br>${esc(o.pickup_time||o.pickup)}｜${esc(o.method)}｜${money(o.total)}${o.note?`<br>備註：${esc(o.note)}`:''}</div><div class="order-actions">${['未取','等待報價','已確認','已取','已取消'].map(s=>`<button data-order="${o.id}" data-status="${s}">${s}</button>`).join('')}</div></article>`).join(''):'<div class="empty">目前沒有符合條件的訂單。</div>';document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>updateOrder(b.dataset.order,b.dataset.status));renderStats()}
async function updateOrder(id,status){if(!adminSession)return alert('請先登入後台');if(ONLINE){const r=await db.rpc('update_order_status',{p_order_id:id,p_new_status:status});if(r.error)return alert(r.error.message)}else{const o=orders.find(x=>x.id===id);o.status=status;save(LS.orders,orders)}await refreshAll();renderAdmin()}
async function addProduct(){if(!adminSession)return alert('請先登入後台');const name=$('newName').value.trim(),unit=$('newUnit').value.trim(),price=+$('newPrice').value,stock=+$('newStock').value;if(!name||!unit||Number.isNaN(price)||Number.isNaN(stock))return alert('請完整填寫商品資料');const p={name,unit,price,stock,emoji:$('newEmoji').value.trim()||'🍎',description:$('newDescription').value.trim(),active:true,sort_order:products.length+1};if(ONLINE){const r=await db.from('products').insert(p);if(r.error)return alert(r.error.message)}else{p.id=Date.now().toString();products.push(p);save(LS.products,products)}['newName','newUnit','newPrice','newStock','newEmoji','newDescription'].forEach(id=>$(id).value='');await refreshAll();renderAdmin()}
function renderProductAdmin(){$('productAdminList').innerHTML=products.map(p=>`<article class="admin-product"><div class="admin-product-top"><div><strong>${esc(p.emoji)} ${esc(p.name)}</strong><div class="order-id">${money(p.price)} / ${esc(p.unit)}</div></div><button class="danger" data-delete="${p.id}">刪除</button></div><div class="admin-product-controls"><label>價格<input type="number" min="0" value="${p.price}" data-price="${p.id}"></label><label>庫存<input type="number" min="0" value="${p.stock}" data-stock="${p.id}"></label><label><input type="checkbox" ${p.active?'checked':''} data-active="${p.id}"> 顯示商品</label></div></article>`).join('');document.querySelectorAll('[data-price],[data-stock],[data-active]').forEach(el=>el.onchange=()=>editProduct(el));document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete))}
async function editProduct(el){if(!adminSession)return alert('請先登入後台');const id=el.dataset.price||el.dataset.stock||el.dataset.active,patch={};if(el.dataset.price)patch.price=Math.max(0,+el.value||0);if(el.dataset.stock)patch.stock=Math.max(0,+el.value||0);if(el.dataset.active)patch.active=el.checked;if(ONLINE){const r=await db.from('products').update(patch).eq('id',id);if(r.error)return alert(r.error.message)}else{Object.assign(products.find(p=>String(p.id)===String(id)),patch);save(LS.products,products)}await refreshAll();renderAdmin()}
async function deleteProduct(id){if(!adminSession)return alert('請先登入後台');if(!confirm('確定刪除此商品？'))return;if(ONLINE){const r=await db.from('products').delete().eq('id',id);if(r.error)return alert(r.error.message)}else{products=products.filter(p=>String(p.id)!==String(id));save(LS.products,products)}await refreshAll();renderAdmin()}
async function saveSettings(){if(!adminSession)return alert('請先登入後台');const patch={location:$('settingLocation').value.trim(),hours:$('settingHours').value.trim(),open:$('settingOpen').value==='true'};if(ONLINE){const r=await db.from('store_settings').upsert({id:1,...patch});if(r.error)return alert(r.error.message)}else{settings=patch;save(LS.settings,settings)}await refreshAll();alert('設定已儲存')}
function exportCSV(){if(!adminSession)return alert('請先登入後台');const rows=[['預約編號','時間','姓名','電話','狀態','取貨時段','方式','商品','金額','地址','備註'],...orders.map(o=>[o.id,o.created_at||o.createdAt,o.name,o.phone,o.status,o.pickup_time||o.pickup,o.method,(o.items||[]).map(i=>`${i.name}x${i.qty}`).join(' / '),o.total,o.address,o.note])];const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`果來好甜訂單-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}

async function loadCurrentStaff(){
 if(!ONLINE||!adminSession){currentStaff=null;return;}
 const r=await db.rpc('get_my_staff_profile');
 if(r.error){console.error(r.error);currentStaff=null;return;}
 currentStaff=Array.isArray(r.data)?r.data[0]:r.data;
}
function applyRoleUI(){
 const role=currentStaff?.role||'';
 document.querySelectorAll('.owner-only').forEach(el=>el.classList.toggle('hidden-by-role',role!=='owner'));
 const canManage=role==='owner'||role==='manager';
 document.querySelector('[data-tab="products"]')?.classList.toggle('hidden-by-role',!canManage);
 document.querySelector('[data-tab="settings"]')?.classList.toggle('hidden-by-role',!canManage);
 $('staffRoleBadge').textContent=roleLabel(role);
}
function roleLabel(role){return({owner:'老闆',manager:'管理員',order_staff:'訂單人員'})[role]||role}
async function refreshStaff(){
 if(!ONLINE||currentStaff?.role!=='owner'){staffMembers=[];return;}
 const r=await db.rpc('list_staff_members');
 if(r.error){console.error(r.error);$('staffMessage').textContent='員工名單讀取失敗，請先執行 staff-upgrade.sql。';staffMembers=[];return;}
 staffMembers=r.data||[];
}
function renderStaff(){
 if(currentStaff?.role!=='owner')return;
 $('staffList').innerHTML=staffMembers.length?staffMembers.map(m=>`<article class="staff-card"><div class="staff-card-top"><div><strong>${esc(m.display_name||'未命名')}</strong><div class="staff-email">${esc(m.email)}</div></div><div class="staff-tags"><span class="role-chip">${roleLabel(m.role)}</span><span class="active-chip ${m.is_active?'on':'off'}">${m.is_active?'啟用':'停用'}</span></div></div><div class="staff-actions"><input value="${esc(m.display_name||'')}" data-staff-name="${m.user_id}" aria-label="員工姓名"><select data-staff-role="${m.user_id}"><option value="owner" ${m.role==='owner'?'selected':''}>老闆</option><option value="manager" ${m.role==='manager'?'selected':''}>管理員</option><option value="order_staff" ${m.role==='order_staff'?'selected':''}>訂單人員</option></select><button class="secondary" data-staff-toggle="${m.user_id}" data-active="${m.is_active}">${m.is_active?'停用':'啟用'}</button></div></article>`).join(''):'<div class="empty">目前還沒有其他員工。</div>';
 document.querySelectorAll('[data-staff-name]').forEach(el=>el.onchange=()=>updateStaffCard(el.dataset.staffName));
 document.querySelectorAll('[data-staff-role]').forEach(el=>el.onchange=()=>updateStaffCard(el.dataset.staffRole));
 document.querySelectorAll('[data-staff-toggle]').forEach(el=>el.onclick=()=>toggleStaff(el.dataset.staffToggle,el.dataset.active!=='true'));
}
async function saveStaff() {
  if (currentStaff?.role !== 'owner') {
    return alert('只有老闆可以管理員工。');
  }

  const email = $('staffEmail').value.trim().toLowerCase();
  const display_name = $('staffName').value.trim();
  const role = $('staffRole').value;
  const is_active = $('staffActive').value === 'true';

  $('staffMessage').textContent = '';

  if (!email || !display_name) {
    $('staffMessage').textContent = '請填寫姓名與 Email。';
    return;
  }

  $('staffMessage').textContent = '正在建立員工帳號…';

  try {
    const { data, error } = await db.functions.invoke('invite-staff', {
      body: {
        email,
        display_name,
        role,
        is_active
      }
    });

    if (error) {
      let message = error.message || '員工帳號建立失敗。';

      try {
        const errorBody = await error.context.json();
        message = errorBody?.error || message;
      } catch (_) {
        // 無法解析伺服器錯誤時，保留原本訊息
      }

      $('staffMessage').textContent = message;
      return;
    }

    if (!data?.success) {
      $('staffMessage').textContent =
        data?.error || '員工帳號建立失敗。';
      return;
    }

    $('staffEmail').value = '';
    $('staffName').value = '';

    const temporaryPassword = data.temporary_password;

    $('staffMessage').textContent = temporaryPassword
      ? `員工帳號建立成功。暫時密碼：${temporaryPassword}，請先複製並交給員工。`
      : '員工帳號建立成功。';

    await refreshStaff();
    renderStaff();
  } catch (error) {
    console.error(error);

    $('staffMessage').textContent =
      error instanceof Error
        ? error.message
        : '建立員工時發生未知錯誤。';
  }
}
async function toggleStaff(userId,isActive){
 const m=staffMembers.find(x=>x.user_id===userId);if(!m)return;
 if(!confirm(`確定要${isActive?'啟用':'停用'} ${m.display_name||m.email}？`))return;
 const r=await db.rpc('update_staff_member',{p_user_id:userId,p_display_name:m.display_name,p_role:m.role,p_is_active:isActive});
 if(r.error)return alert(r.error.message);await refreshStaff();renderStaff();
}

init();
