// End-to-end browser test (Playwright). Usage: BASE_URL=http://localhost:5000 node tests/e2e/e2e.js
const { chromium } = require('playwright');
const S=(process.env.SHOT_DIR||'tests/e2e/out')+'/'; require('fs').mkdirSync(S,{recursive:true});
const B=(process.env.BASE_URL||'http://localhost:5000')+'/';
(async()=>{
 const b=await chromium.launch(); const errs=[];
 const mk=async()=>{const p=await b.newPage({viewport:{width:1366,height:850}});
  p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/422/.test(m.text()))errs.push('CONSOLE '+m.text())});
  p.on('response',r=>{if(r.status()>=400&&!/signup/.test(r.url()))errs.push(r.status()+' '+r.url())}); return p;};
 const login=async(p,e,pw)=>{await p.goto(B);await p.waitForSelector('input[name=email]');await p.fill('input[name=email]',e);await p.fill('input[name=password]',pw);await p.click('.btn.primary');await p.waitForSelector('#view',{timeout:8000});await p.waitForTimeout(800);};
 const viewErr=async(p,tag)=>{const t=await p.locator('#view').innerText(); if(/Something went wrong|Page not found/i.test(t)) errs.push('VIEWERR '+tag+': '+t.slice(0,150));};
 let p=await mk(); await login(p,'admin@brightloop.com','Admin@12345'); await p.screenshot({path:S+'02dash.png'});
 for(const r of ['dashboard','subscriptions','subscriptions/new','invoices','payments','customers','products','plans','templates','taxes','discounts','team']){
  await p.goto(B+'#/'+r); await p.waitForTimeout(700); await viewErr(p,r); await p.screenshot({path:S+'r_'+r.replace('/','_')+'.png'});}
 // new subscription from template
 await p.goto(B+'#/subscriptions/new'); await p.waitForSelector('#sf');
 const tpl=await p.locator('select[name=template_id] option').allInnerTexts(); console.log('templates',tpl);
 await p.selectOption('select[name=template_id]',{index:1});
 await p.selectOption('select[name=customer_id]',{index:1});
 await p.click('#sf button[type=submit]'); await p.waitForTimeout(1200); await viewErr(p,'create');
 console.log('after create:',p.url(), (await p.locator('#view h1').innerText()));
 for(const a of ['send','confirm','activate']){ await p.click(`[data-act=${a}]`); await p.waitForTimeout(900); }
 console.log('status steps:',await p.locator('.step.now').innerText()); await p.screenshot({path:S+'sub_active.png'});
 // billing
 await p.goto(B+'#/invoices'); await p.waitForTimeout(600); await p.click('[data-run]'); await p.waitForTimeout(400);
 await p.screenshot({path:S+'billing_modal.png'});
 await p.click('.modal .btn.primary, dialog .btn.primary, [role=dialog] .btn.primary'); await p.waitForTimeout(1500);
 await p.screenshot({path:S+'invoices_after.png'});
 await p.click('table a.link >> nth=0'); await p.waitForTimeout(900);
 const inv=await p.locator('#view h1').innerText(); console.log('invoice',inv);
 if(await p.locator('[data-a=confirm]').count()){await p.click('[data-a=confirm]');await p.waitForTimeout(800);}
 await p.click('[data-a=pay]'); await p.waitForTimeout(400); await p.screenshot({path:S+'pay_modal.png'});
 await p.click('.modal .btn.primary, dialog .btn.primary, [role=dialog] .btn.primary'); await p.waitForTimeout(1200);
 await p.screenshot({path:S+'invoice_paid.png'}); console.log('after pay:',(await p.locator('#view h1').innerText()));
 await p.goto(B+'#/dashboard'); await p.waitForTimeout(900); await p.screenshot({path:S+'dash2.png'});
 // customer
 const c=await mk(); await login(c,'customer@example.com','Customer@123');
 for(const r of ['subscriptions','invoices','plans','profile']){await c.goto(B+'#/'+r);await c.waitForTimeout(600);await viewErr(c,'cust '+r);await c.screenshot({path:S+'c_'+r+'.png'});}
 // signup validation
 const s=await mk(); await s.goto(B+'#/signup'); await s.waitForSelector('input[name=email]');
 await s.fill('input[name=name]','T U');await s.fill('input[name=email]','admin@brightloop.com');await s.fill('input[name=password]','weak');await s.click('.btn.primary');await s.waitForTimeout(600);await s.screenshot({path:S+'signup_err.png'});
 // mobile
 const m=await b.newPage({viewport:{width:390,height:800}}); await login(m,'admin@brightloop.com','Admin@12345'); await m.screenshot({path:S+'mobile.png'});
 console.log(errs.join('\n')||'NO ERRORS'); await b.close(); process.exit(errs.length?1:0);
})().catch(e=>{console.log('FAIL',e.message.slice(0,400));process.exit(1)});
