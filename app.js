import { auth, db, API_URL } from './firebase-config.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ========== TOAST ==========
window.toast = function(msg, type='info'){
  let c = document.getElementById('tc');
  if(!c){c=document.createElement('div');c.id='tc';document.body.appendChild(c);}
  const t = document.createElement('div');
  t.className = 'toast '+type; t.textContent = msg; c.appendChild(t);
  setTimeout(()=>t.remove(), 3500);
};

// ========== AUTH STATE ==========
onAuthStateChanged(auth, async (user)=>{
  const area = document.getElementById('auth-area');
  if(area){
    if(user){
      const snap = await getDoc(doc(db,'users',user.uid));
      const p = snap.exists()?snap.data():{};
      area.innerHTML = `<a href="dashboard.html" class="btn bp bs">Dashboard</a>
        <button class="btn bo bs" id="lo">Logout</button>`;
      document.getElementById('lo').onclick = async ()=>{
        await signOut(auth); toast('Logged out','success');
        setTimeout(()=>location.href='index.html',500);
      };
    } else {
      area.innerHTML = `<a href="login.html">Login</a><a href="login.html#register" class="btn bp bs">Register</a>`;
    }
  }
});

// ========== MOBILE MENU ==========
document.addEventListener('DOMContentLoaded', ()=>{
  const t = document.querySelector('.mt');
  const n = document.querySelector('.mnav');
  if(t&&n) t.onclick = ()=>n.classList.toggle('open');
});

// ========== PAGE ROUTER (data-page attr) ==========
document.addEventListener('DOMContentLoaded', ()=>{
  const page = document.body.dataset.page;
  if(page==='home') initHome();
  if(page==='services') initServices();
  if(page==='login') initLogin();
  if(page==='dashboard') initDashboard();
  if(page==='apply') initApply();
  if(page==='contact') initContact();
});

// ========== HOME ==========
async function initHome(){
  const box = document.getElementById('home-services');
  if(!box) return;
  try{
    const q = query(collection(db,'services'), where('active','==',true), limit(6));
    const snap = await getDocs(q);
    if(snap.empty){box.innerHTML='<p class="empty" style="grid-column:1/-1">No services yet.</p>';return;}
    box.innerHTML = snap.docs.map(d=>{
      const s = d.data();
      return `<div class="sc"><div class="si">${s.icon||'📄'}</div>
        <span class="tag">${s.category||'General'}</span>
        <h3>${s.name}</h3><p>${(s.description||'').slice(0,80)}</p>
        <div class="sm"><span class="sf">₹${s.fee||0}</span>
        <a href="apply.html?id=${d.id}" class="btn bp bs">Apply</a></div></div>`;
    }).join('');
  }catch(e){box.innerHTML='<p class="empty">Unable to load.</p>';}
}

// ========== SERVICES ==========
let allSvc = [];
async function initServices(){
  const box = document.getElementById('services-grid');
  if(!box) return;
  const snap = await getDocs(query(collection(db,'services'), where('active','==',true)));
  allSvc = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderServices(allSvc);
  const s = document.getElementById('search');
  if(s) s.oninput = ()=>renderServices(allSvc.filter(x=>x.name?.toLowerCase().includes(s.value.toLowerCase())));
}
function renderServices(list){
  const box = document.getElementById('services-grid');
  if(!list.length){box.innerHTML='<p class="empty" style="grid-column:1/-1">No services found.</p>';return;}
  box.innerHTML = list.map(s=>`
    <div class="sc"><div class="si">${s.icon||'📄'}</div>
    <span class="tag">${s.category||'General'}</span>
    <h3>${s.name}</h3><p>${s.description||''}</p>
    <div class="sm"><span class="sf">₹${s.fee||0}</span>
    <a href="apply.html?id=${s.id}" class="btn bp bs">Apply</a></div></div>`).join('');
}

// ========== LOGIN / REGISTER / FORGOT ==========
function initLogin(){
  const loginF = document.getElementById('login-form');
  const regF = document.getElementById('reg-form');
  const fpF = document.getElementById('fp-form');
  const tabs = document.querySelectorAll('.tabs button');

  if(tabs.length){
    tabs.forEach(b=>b.onclick=()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.tab-view').forEach(v=>v.style.display='none');
      document.getElementById(b.dataset.tab).style.display='block';
    });
  }

  if(loginF) loginF.onsubmit = async (e)=>{
    e.preventDefault();
    const btn = loginF.querySelector('button');
    btn.disabled=true; btn.textContent='Logging in...';
    try{
      const cred = await signInWithEmailAndPassword(auth, email.value, password.value);
      const snap = await getDoc(doc(db,'users',cred.user.uid));
      const role = snap.exists()?snap.data().role:'VLE';
      toast('Login successful','success');
      setTimeout(()=>location.href='dashboard.html',500);
    }catch(err){toast(err.message.replace('Firebase: ',''),'error');}
    finally{btn.disabled=false;btn.textContent='Login';}
  };

  if(regF) regF.onsubmit = async (e)=>{
    e.preventDefault();
    const btn = regF.querySelector('button');
    btn.disabled=true; btn.textContent='Creating...';
    try{
      const cred = await createUserWithEmailAndPassword(auth, r_email.value, r_password.value);
      await setDoc(doc(db,'users',cred.user.uid),{
        uid:cred.user.uid, name:r_name.value, email:r_email.value,
        mobile:r_mobile.value, role:'VLE', status:'Active',
        createdAt:serverTimestamp()
      });
      // Notify admin via backend
      fetch(API_URL+'/api/notify/registration',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:r_name.value,email:r_email.value,mobile:r_mobile.value})}).catch(()=>{});
      toast('Registration successful!','success');
      setTimeout(()=>location.href='dashboard.html',800);
    }catch(err){toast(err.message.replace('Firebase: ',''),'error');}
    finally{btn.disabled=false;btn.textContent='Register';}
  };

  if(fpF) fpF.onsubmit = async (e)=>{
    e.preventDefault();
    const btn = fpF.querySelector('button');
    btn.disabled=true; btn.textContent='Sending...';
    try{
      await sendPasswordResetEmail(auth, fp_email.value);
      toast('Reset link sent to email','success');
      fpF.reset();
    }catch(err){toast(err.message.replace('Firebase: ',''),'error');}
    finally{btn.disabled=false;btn.textContent='Send Reset Link';}
  };
}

// ========== DASHBOARD (VLE + Admin) ==========
async function initDashboard(){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){location.href='login.html';return;}
    const snap = await getDoc(doc(db,'users',user.uid));
    if(!snap.exists()){toast('User profile missing','error');return;}
    const profile = snap.data();
    document.getElementById('uname').textContent = `Hello, ${profile.name||user.email}`;
    const roleBadge = document.getElementById('role');
    roleBadge.textContent = profile.role;
    roleBadge.className = 'tag';

    if(profile.role==='ADMIN') renderAdmin(user,profile);
    else renderVLE(user,profile);
  });
}

// -------- VLE Dashboard --------
async function renderVLE(user){
  const sidebar = document.getElementById('side');
  sidebar.innerHTML = `
    <a data-t="overview" class="active">📊 Overview</a>
    <a data-t="services">🛠️ Services</a>
    <a data-t="apps">📋 My Applications</a>
    <a href="index.html">🏠 Home</a>`;

  const aSnap = await getDocs(query(collection(db,'applications'), where('userId','==',user.uid)));
  const apps = aSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="sl">Total</div><div class="sv">${apps.length}</div></div>
    <div class="stat"><div class="sl">Pending</div><div class="sv">${apps.filter(a=>a.status==='Pending'||a.status==='Payment Pending').length}</div></div>
    <div class="stat"><div class="sl">Approved</div><div class="sv">${apps.filter(a=>a.status==='Approved').length}</div></div>
    <div class="stat"><div class="sl">Rejected</div><div class="sv">${apps.filter(a=>a.status==='Rejected').length}</div></div>`;

  const content = document.getElementById('content');
  const show = async (tab)=>{
    if(tab==='overview'){
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">Recent Applications</h3>
        ${apps.slice(0,5).map(a=>row(a)).join('')||'<p class="empty">No applications. <a href="services.html">Browse services</a></p>'}`;
    } else if(tab==='services'){
      const sSnap = await getDocs(query(collection(db,'services'), where('active','==',true)));
      const svcs = sSnap.docs.map(d=>({id:d.id,...d.data()}));
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">Available Services</h3>
        <div class="g2">${svcs.map(s=>`<div class="sc"><div class="si">${s.icon||'📄'}</div>
          <h3>${s.name}</h3><div class="sm"><span class="sf">₹${s.fee||0}</span>
          <a href="apply.html?id=${s.id}" class="btn bp bs">Apply</a></div></div>`).join('')}</div>`;
    } else {
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">All Applications</h3>
        <div class="tw"><table><thead><tr><th>ID</th><th>Service</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${apps.map(a=>`<tr>
          <td><b>${a.applicationId}</b></td><td>${a.serviceName}</td>
          <td>₹${a.amount}</td>
          <td><span class="pill ${pill(a.status)}">${a.status}</span></td>
          <td>${fmtDate(a.createdAt)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No applications</td></tr>'}</tbody></table></div>`;
    }
  };
  sidebar.querySelectorAll('[data-t]').forEach(a=>a.onclick=()=>{
    sidebar.querySelectorAll('a').forEach(x=>x.classList.remove('active'));
    a.classList.add('active'); show(a.dataset.t);
  });
  show('overview');
}

// -------- ADMIN Dashboard --------
async function renderAdmin(user){
  const sidebar = document.getElementById('side');
  sidebar.innerHTML = `
    <a data-t="overview" class="active">📊 Dashboard</a>
    <a data-t="services">🛠️ Services</a>
    <a data-t="apps">📋 Applications</a>
    <a data-t="users">👥 VLE Users</a>
    <a data-t="news">📰 News</a>
    <a data-t="msgs">✉️ Messages</a>
    <a href="index.html">🏠 Home</a>`;

  const [a,s,u] = await Promise.all([
    getDocs(collection(db,'applications')),
    getDocs(collection(db,'services')),
    getDocs(collection(db,'users'))
  ]);
  const apps = a.docs.map(d=>({id:d.id,...d.data()}));
  const svcs = s.docs.map(d=>({id:d.id,...d.data()}));
  const users = u.docs.map(d=>({id:d.id,...d.data()}));

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="sl">VLE Users</div><div class="sv">${users.filter(x=>x.role==='VLE').length}</div></div>
    <div class="stat"><div class="sl">Services</div><div class="sv">${svcs.length}</div></div>
    <div class="stat"><div class="sl">Applications</div><div class="sv">${apps.length}</div></div>
    <div class="stat"><div class="sl">Pending</div><div class="sv">${apps.filter(x=>x.status==='Pending').length}</div></div>`;

  const content = document.getElementById('content');
  const show = async (tab)=>{
    if(tab==='overview'){
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">Quick Actions</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn bp" onclick="addService()">+ Add Service</button>
          <button class="btn bo" onclick="document.querySelector('[data-t=apps]').click()">View Applications</button>
        </div>`;
    } else if(tab==='services'){
      content.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <h3 style="color:#1e3a8a">Services</h3>
        <button class="btn bp bs" onclick="addService()">+ Add</button></div>
        <div class="tw"><table><thead><tr><th>Name</th><th>Category</th><th>Fee</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${svcs.map(s=>`<tr>
          <td>${s.name}</td><td>${s.category||'-'}</td><td>₹${s.fee||0}</td>
          <td><span class="pill ${s.active?'pa':'pr'}">${s.active?'Active':'Inactive'}</span></td>
          <td><button class="btn bo bs" onclick="toggleSvc('${s.id}',${s.active})">${s.active?'Disable':'Enable'}</button>
          <button class="btn bd bs" onclick="delSvc('${s.id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`;
    } else if(tab==='apps'){
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">Applications</h3>
        <div class="tw"><table><thead><tr><th>App ID</th><th>Service</th><th>User</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${apps.map(x=>`<tr>
          <td><b>${x.applicationId}</b></td><td>${x.serviceName}</td><td>${x.userEmail||'-'}</td>
          <td>₹${x.amount||0}</td>
          <td><span class="pill ${pill(x.status)}">${x.status}</span></td>
          <td><button class="btn bo bs" onclick="setStatus('${x.id}','Approved')">Approve</button>
          <button class="btn bd bs" onclick="setStatus('${x.id}','Rejected')">Reject</button></td></tr>`).join('')}</tbody></table></div>`;
    } else if(tab==='users'){
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">VLE Users</h3>
        <div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th></tr></thead>
        <tbody>${users.map(x=>`<tr><td>${x.name||'-'}</td><td>${x.email}</td><td>${x.mobile||'-'}</td>
        <td><span class="tag">${x.role}</span></td></tr>`).join('')}</tbody></table></div>`;
    } else if(tab==='news'){
      const nSnap = await getDocs(collection(db,'news'));
      const news = nSnap.docs.map(d=>({id:d.id,...d.data()}));
      content.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <h3 style="color:#1e3a8a">News</h3>
        <button class="btn bp bs" onclick="addNews()">+ Add</button></div>
        ${news.map(n=>`<div class="card" style="margin-bottom:10px">
          <b>${n.title}</b><p style="font-size:13px;color:#64748b">${n.content}</p></div>`).join('')||'<p class="empty">No news</p>'}`;
    } else if(tab==='msgs'){
      const mSnap = await getDocs(collection(db,'messages'));
      const msgs = mSnap.docs.map(d=>({id:d.id,...d.data()}));
      content.innerHTML = `<h3 style="color:#1e3a8a;margin-bottom:14px">Contact Messages</h3>
        ${msgs.map(m=>`<div class="card" style="margin-bottom:10px">
          <b>${m.name} (${m.email})</b> - ${m.subject}
          <p style="font-size:13px;color:#64748b">${m.message}</p></div>`).join('')||'<p class="empty">No messages</p>'}`;
    }
  };

  window.addService = async ()=>{
    const name = prompt('Service name:'); if(!name) return;
    const category = prompt('Category:')||'General';
    const fee = parseInt(prompt('Fee ₹:')||'0',10);
    const description = prompt('Description:')||'';
    const rawF = prompt('Fields (comma-separated):')||'';
    const fields = rawF.split(',').map(s=>s.trim()).filter(Boolean).map((lbl,i)=>({name:'f'+i,label:lbl,type:'text',required:true}));
    await addDoc(collection(db,'services'),{name,category,fee,description,fields,active:true,order:Date.now(),createdAt:serverTimestamp()});
    toast('Service added','success'); location.reload();
  };
  window.toggleSvc = async (id,active)=>{await updateDoc(doc(db,'services',id),{active:!active});toast('Updated','success');location.reload();};
  window.delSvc = async (id)=>{if(!confirm('Delete?'))return;await deleteDoc(doc(db,'services',id));toast('Deleted','success');location.reload();};
  window.setStatus = async (id,status)=>{
    const update = {status,updatedAt:serverTimestamp()};
    if(status==='Rejected'){const r=prompt('Reason:')||'';if(r)update.rejectionReason=r;}
    await updateDoc(doc(db,'applications',id),update);
    fetch(API_URL+'/api/notify/status',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({applicationId:id,status})}).catch(()=>{});
    toast('Status updated','success'); location.reload();
  };
  window.addNews = async ()=>{
    const title = prompt('Title:'); if(!title) return;
    const cont = prompt('Content:')||'';
    await addDoc(collection(db,'news'),{title,content:cont,published:true,createdAt:serverTimestamp()});
    toast('News added','success'); location.reload();
  };

  sidebar.querySelectorAll('[data-t]').forEach(a=>a.onclick=()=>{
    sidebar.querySelectorAll('a').forEach(x=>x.classList.remove('active'));
    a.classList.add('active'); show(a.dataset.t);
  });
  show('overview');
}

// ========== APPLY ==========
async function initApply(){
  const id = new URLSearchParams(location.search).get('id');
  if(!id){location.href='services.html';return;}

  onAuthStateChanged(auth, async (user)=>{
    if(!user){toast('Please login first','error');setTimeout(()=>location.href='login.html',800);return;}

    const snap = await getDoc(doc(db,'services',id));
    if(!snap.exists()){toast('Service not found','error');location.href='services.html';return;}
    const svc = {id:snap.id,...snap.data()};

    document.getElementById('svc-name').textContent = svc.name;
    document.getElementById('svc-desc').textContent = svc.description||'';
    document.getElementById('svc-fee').textContent = '₹'+(svc.fee||0);
    document.getElementById('svc-cat').textContent = svc.category||'General';

    const form = document.getElementById('apply-form');
    form.innerHTML = (svc.fields||[]).map(f=>field(f)).join('');

    document.getElementById('loading').style.display='none';
    document.getElementById('wrap').style.display='block';

    document.getElementById('pay-btn').onclick = async ()=>{
      const btn = document.getElementById('pay-btn');
      btn.disabled=true; btn.textContent='Processing...';
      try{
        const fd = new FormData(form);
        const data = {}; for(const [k,v] of fd.entries()) data[k]=v;

        const appId = 'ANR-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).substring(2,8).toUpperCase();

        const docRef = await addDoc(collection(db,'applications'),{
          applicationId:appId, userId:user.uid, userEmail:user.email,
          serviceId:svc.id, serviceName:svc.name, category:svc.category,
          data, amount:svc.fee||0,
          paymentStatus:'Pending', status:'Payment Pending',
          createdAt:serverTimestamp()
        });

        const token = await user.getIdToken();
        const res = await fetch(API_URL+'/api/payment/create-order',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body:JSON.stringify({applicationId:docRef.id, amount:svc.fee||0})
        });
        const json = await res.json();
        if(!res.ok) throw new Error(json.error||'Payment init failed');

        if(json.payment_session_id){
          const cf = window.Cashfree({mode:json.env||'sandbox'});
          cf.checkout({paymentSessionId:json.payment_session_id, redirectTarget:'_self'});
        } else {
          toast('Order created: '+appId,'success');
          setTimeout(()=>location.href='dashboard.html',1500);
        }
      }catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Submit & Pay';}
    };
  });
}

function field(f){
  const r = f.required?'required':'';
  const lbl = `<label>${f.label}${f.required?' *':''}</label>`;
  let inp='';
  switch(f.type){
    case 'textarea': inp=`<textarea name="${f.name}" placeholder="${f.placeholder||''}" ${r}></textarea>`;break;
    case 'select': inp=`<select name="${f.name}" ${r}><option value="">Select...</option>${(f.options||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;break;
    case 'number': inp=`<input type="number" name="${f.name}" ${r}>`;break;
    case 'email': inp=`<input type="email" name="${f.name}" ${r}>`;break;
    case 'tel': inp=`<input type="tel" name="${f.name}" pattern="[0-9]{10}" ${r}>`;break;
    case 'date': inp=`<input type="date" name="${f.name}" ${r}>`;break;
    default: inp=`<input type="text" name="${f.name}" placeholder="${f.placeholder||''}" ${r}>`;
  }
  return `<div class="fg">${lbl}${inp}</div>`;
}

// ========== CONTACT ==========
function initContact(){
  const f = document.getElementById('contact-form');
  if(!f) return;
  f.onsubmit = async (e)=>{
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled=true; btn.textContent='Sending...';
    try{
      await addDoc(collection(db,'messages'),{
        name:c_name.value, email:c_email.value, subject:c_subject.value,
        message:c_message.value, createdAt:serverTimestamp(), read:false
      });
      fetch(API_URL+'/api/notify/contact',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:c_name.value,email:c_email.value,subject:c_subject.value,message:c_message.value})}).catch(()=>{});
      toast('Message sent!','success'); f.reset();
    }catch(err){toast('Failed','error');}
    finally{btn.disabled=false;btn.textContent='Send Message';}
  };
}

// ========== HELPERS ==========
function pill(s){
  if(s==='Approved')return 'pa'; if(s==='Rejected')return 'pr';
  if(s==='Completed')return 'pc'; if(s==='In Process')return 'pi'; return 'pp';
}
function row(a){
  return `<div style="padding:12px;border-bottom:1px solid #dbeafe;display:flex;justify-content:space-between;align-items:center">
    <div><b>${a.applicationId}</b><br><span style="font-size:13px;color:#64748b">${a.serviceName} • ₹${a.amount}</span></div>
    <span class="pill ${pill(a.status)}">${a.status}</span></div>`;
}
function fmtDate(ts){
  if(!ts)return '-'; const d = ts.seconds?new Date(ts.seconds*1000):new Date(ts);
  return d.toLocaleDateString('en-IN');
}
