/* ============================================================
   Elera · Patient Flow — mock clinic data
   初始数据 1:1 对齐参考截图；交互后所有数字由真实状态推导。
   ============================================================ */
window.DATA = (() => {

  /* ---------- stage (column) meta ---------- */
  const STAGES = [
    { id: 'checkin',   label: 'Check-in',     meta: 'target 5m',    target: 5,  badge: 2 },
    { id: 'triage',    label: 'Triage',       meta: 'target 10m',   target: 10, badge: 2 },
    { id: 'treatment', label: 'In Treatment', meta: 'avg 32m',      target: null, badge: 2 },
    { id: 'ready',     label: 'Ready to D/C', meta: 'bill first',   target: null, badge: 2 },
    { id: 'left',      label: 'Left today',   meta: 'avg D2D 58m',  target: null, green: true, badge: 2 },
  ];

  /* ---------- avatar palette ---------- */
  const COLORS = {
    teal:'#3BBFA3', blue:'#5F8BEF', rose:'#EE8F9C', violet:'#9D7CE8', coral:'#E2604F',
    ember:'#E4693F', indigo:'#6F66EA', peach:'#EC8A4B', red:'#DE5A50', raspberry:'#DC4467',
    navy:'#5C7FE8', sage:'#59A46F', steel:'#5E87D8', olive:'#B2952F', plum:'#8A63E8',
  };

  /* ---------- patients（与参考图逐卡对应） ---------- */
  // flag: over=超时 | new=新病人 | noDoc=未分配医生 | interp=需翻译 | blockedOn=被阻塞
  const patients = [
    /* Check-in */
    { id:'p01', name:'Elle S',  reason:'Coughing',        color:'teal',
      stage:'checkin', loc:{ icon:'bay',  label:'Bay 1' }, wait:11 },
    { id:'p02', name:'Marco R', reason:'Insurance verify',color:'blue',
      stage:'checkin', loc:{ icon:'kiosk',label:'Kiosk' },   wait:3 },
    { id:'p03', name:'Tina W',  reason:'Sore throat',     color:'rose',
      stage:'checkin', loc:{ icon:'bay',  label:'Bay 2' }, wait:7 },
    { id:'p04', name:'Sara K',  reason:'Rash, itching',   color:'violet',
      stage:'checkin', loc:{ icon:'walk', label:'Walk-in' },wait:2 },

    /* Triage */
    { id:'p05', name:'Dana M',  reason:'Coughing',        color:'coral',
      stage:'triage', team:'CH', loc:{ icon:'bay', label:'Bay 2' }, wait:15,
      note:{ kind:'coach', text:'13m over target. Dr. Chen has a video slot at 12:35.' } },
    { id:'p06', name:'Aisha K', reason:'Headache, nausea',color:'ember',
      stage:'triage', loc:{ icon:'bay', label:'Bay 6' }, wait:8 },
    { id:'p07', name:'James W', reason:'Wrist sprain',    color:'indigo',
      stage:'triage', loc:{ icon:'bay', label:'Bay 3' }, wait:3 },
    { id:'p08', name:'Priya D', reason:'Follow-up labs',  color:'peach',
      stage:'triage', loc:{ icon:'bay', label:'Bay 5' }, wait:1, flag:{ new:true } },
    { id:'p09', name:'Leo T',   reason:'Allergic reaction',color:'red',
      stage:'triage', loc:{ icon:'bay', label:'Bay 4' }, wait:4 },

    /* In Treatment */
    { id:'p10', name:'Rita G',  reason:'Ankle sprain',    color:'raspberry',
      stage:'treatment', team:'DR', loc:{ icon:'room', label:'Room 8B' }, wait:28, tierFixed:'t-rose',
      note:{ kind:'alert', text:'Longest in room today.\nPre-op labs still not released.' } },
    { id:'p11', name:'Nazmi J', reason:'Chest pain eval', color:'navy',
      stage:'treatment', loc:{ icon:'room', label:'Room 12A' }, wait:45, tierFixed:'t-amber', doctor:null },
    { id:'p12', name:'Karen L', reason:'Migraine',        color:'sage',
      stage:'treatment', loc:{ icon:'room', label:'Room 5A' }, wait:18 },

    /* Ready to D/C */
    { id:'p13', name:'Linda C', reason:'Rx sent to pharmacy', color:'raspberry',
      stage:'ready', loc:{ icon:'room', label:'Room 10A' }, wait:6,
      invoice:{ amount:42, paid:false } },
    { id:'p14', name:'Sam B',   reason:'Awaiting lab release', color:'plum',
      stage:'ready', loc:{ icon:'room', label:'Room 7B' }, wait:14,
      action:{ type:'lab', label:'Follow up with lab' }, flag:{ blockedOn:'Lab results pending' } },

    /* Left today */
    { id:'p15', name:'Tom H',  reason:'Chest pain eval', color:'steel',
      stage:'left', span:'08:40 to 09:35', dur:12 },
    { id:'p16', name:'Jake P', reason:'Minor laceration', color:'olive',
      stage:'left', span:'09:10 to 10:20', dur:8 },
  ];

  /* 首屏装饰性初值（首次交互后全部改为真实推导） */
  const INITIAL = {
    statPatients: 20, statDelta: '+31%', statWait: '12min', statOver: 2, roomsFree: 4,
    roomsTotal: 203, showing: 'Showing 2 of 20 patients',
    quickCounts: { breaching:4, blocked:3, nodoc:1, newpt:4, interp:2 },
    billed: 1284, collected: 960, insurance: 324, sameRate: 75,
  };

  /* ---------- staff ---------- */
  const staff = [
    { id:'s1', name:'Dr. Amara Chen', role:'Physician · Video slot 12:35', room:'Suite 2', load:4, on:true,  color:'teal'  },
    { id:'s2', name:'Dr. Ravi Patel', role:'Physician',                room:'Room 8B', load:6, on:true,  color:'indigo'},
    { id:'s3', name:'Nora Kim',       role:'RN · Triage lead',         room:'Bay 1–6', load:8, on:true,  color:'rose'  },
    { id:'s4', name:'Luis Ortega',    role:'PA',                       room:'Room 5A', load:3, on:false, color:'olive' },
    { id:'s5', name:'Mei Tanaka',     role:'Front desk',               room:'Desk 1',  load:2, on:true,  color:'blue'  },
    { id:'s6', name:'Sam Okafor',     role:'Lab tech',                 room:'Lab',     load:5, on:false, color:'peach' },
  ];

  /* ---------- appointments today（badge = 10） ---------- */
  const appointments = [
    { time:'08:40', dur:55, patient:'Tom H',      type:'New',      who:'Dr. Patel', state:'done'    },
    { time:'09:10', dur:70, patient:'Jake P',     type:'Procedure',who:'Dr. Chen',  state:'done'    },
    { time:'11:00', dur:20, patient:'Priya D',    type:'Follow-up',who:'Dr. Chen',  state:'now'     },
    { time:'11:30', dur:30, patient:'Aisha K',    type:'New',      who:'Dr. Patel', state:'soon'    },
    { time:'12:35', dur:15, patient:'Dana M',     type:'Video',    who:'Dr. Chen',  state:'offer'   },
    { time:'13:00', dur:30, patient:'Marco R',    type:'Follow-up',who:'Dr. Patel', state:'later'   },
    { time:'14:00', dur:45, patient:'Nazmi J',    type:'New',      who:'Dr. Patel', state:'later'   },
    { time:'15:15', dur:20, patient:'Sara K',     type:'Follow-up',who:'Dr. Chen',  state:'later'   },
    { time:'16:00', dur:30, patient:'James W',    type:'Procedure',who:'Dr. Chen',  state:'later'   },
    { time:'16:45', dur:30, patient:'New — walk-in',type:'New',    who:'Unassigned',state:'open'    },
  ];

  /* ---------- messages ---------- */
  const threads = [
    { id:'t1', from:'Dr. Amara Chen', preview:'Video slot for Dana M confirmed at 12:35.', time:'12:02', unread:2, color:'teal',
      msgs:[
        ['them','Dana M is 13m past triage target — do you want the 12:35 video slot?','12:01'],
        ['me','Yes please, send it to her.','12:01'],
        ['them','Sent. She\'ll see a link on her intake screen.','12:02'],
        ['them','Also flagging: her oxygen history looks fine, good for telehealth.','12:02'],
      ] },
    { id:'t2', from:'Lab · Sam Okafor', preview:'Rita G pre-op labs — releasing in ~10 min.', time:'11:47', unread:0, color:'olive',
      msgs:[
        ['me','Any ETA on Rita G pre-op labs? She\'s longest in room.','11:46'],
        ['them','Centrifuge just finished, releasing in about 10 minutes.','11:47'],
      ] },
    { id:'t3', from:'Front desk · Mei', preview:'Walk-in registered → Bay 4 (Leo T).', time:'11:31', unread:0, color:'blue',
      msgs:[['them','Allergic reaction walk-in checked in and seated in Bay 4.','11:31']] },
    { id:'t4', from:'Billing · Auto-desk', preview:'Invoice #1042 ($42) ready for Linda C.', time:'11:12', unread:1, color:'raspberry',
      msgs:[['them','Invoice $42 is queued to collect before discharge.','11:12']] },
    { id:'t5', from:'Interpreter services', preview:'Spanish interpreter booked 13:15 for Aisha.', time:'10:58', unread:0, color:'ember',
      msgs:[['them','Booked: Spanish interpreter at 13:15, Room 12A.','10:58']] },
  ];

  /* ---------- pharmacy & labs orders ---------- */
  const orders = [
    { id:'o1', patient:'Rita G', item:'Pre-op labs (CBC, CMP)', stage:'Ready to release', room:'Room 8B',  urgent:true,  relTo:'p10' },
    { id:'o2', patient:'Sam B',  item:'Troponin follow-up panel', stage:'In analysis',  room:'Room 7B',  urgent:true,  relTo:'p14' },
    { id:'o3', patient:'Karen L',item:'IV fluids refill',       stage:'Preparing',      room:'Room 5A',  urgent:false, relTo:'p12' },
    { id:'o4', patient:'Linda C',item:'Rx — azithromycin 500mg',stage:'Sent to pharmacy',room:'Room 10A',urgent:false, relTo:'p13' },
    { id:'o5', patient:'Priya D',item:'Annual lipid panel',     stage:'Scheduled 13:00', room:'Bay 5',   urgent:false, relTo:'p08' },
  ];

  /* ---------- claims（与 Left today 汇总一致） ---------- */
  const claims = [
    { id:'c1', patient:'Tom H',   payer:'Aetna',        amount:320, status:'Paid',        copayAtDesk:180 },
    { id:'c2', patient:'Jake P',  payer:'Self-pay',     amount:150, status:'Paid',        copayAtDesk:150 },
    { id:'c3', patient:'Linda C', payer:'Blue Shield',  amount:242, status:'Awaiting desk', copayAtDesk:42 },
    { id:'c4', patient:'Sam B',   payer:'Cigna',        amount:280, status:'Blocked — lab', copayAtDesk:60 },
    { id:'c5', patient:'Rita G',  payer:'United',       amount:182, status:'Submitted',   copayAtDesk:96 },
    { id:'c6', patient:'Karen L', payer:'Medicare',     amount:110, status:'Submitted',   copayAtDesk:62 },
  ];

  /* ---------- dashboard arrivals /hour ---------- */
  const arrivals = [
    { h:'08', n:6 }, { h:'09', n:9 }, { h:'10', n:7 }, { h:'11', n:11 }, { h:'12', n:8 },
    { h:'13', n:5 }, { h:'14', n:7 }, { h:'15', n:6 }, { h:'16', n:4 },  { h:'17', n:2 },
  ];

  return { STAGES, COLORS, patients, INITIAL, staff, appointments, threads, orders, claims, arrivals };
})();
