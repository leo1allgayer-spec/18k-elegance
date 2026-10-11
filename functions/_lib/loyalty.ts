import type { Env } from './types';
export const brazilDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
export async function loyaltyOverview(env:Env,customerId:number){
 const today=brazilDate();
 const customer=await env.DB.prepare('SELECT birth_date FROM customers WHERE id=?').bind(customerId).first<{birth_date:string|null}>();
 if(customer?.birth_date?.slice(5)===today.slice(5))await env.DB.prepare("INSERT OR IGNORE INTO loyalty_rewards(customer_id,kind,cycle,percent,expires_on) VALUES(?,'birthday',?,10,?)").bind(customerId,Number(today.slice(0,4)),today).run();
 const account=await env.DB.prepare('SELECT purchase_count,rewards_issued FROM loyalty_accounts WHERE customer_id=?').bind(customerId).first<{purchase_count:number;rewards_issued:number}>();
 const rewards=await env.DB.prepare(`SELECT r.id,r.kind,r.percent,r.expires_on,COALESCE((SELECT u.status FROM loyalty_reward_uses u WHERE u.reward_id=r.id AND u.status IN ('held','spent') LIMIT 1),'available') AS status FROM loyalty_rewards r WHERE r.customer_id=? ORDER BY r.percent DESC,r.id`).bind(customerId).all<{id:number;kind:string;percent:number;expires_on:string|null;status:string}>();
 return {...(account||{purchase_count:0,rewards_issued:0}),progress:(account?.purchase_count||0)%10,rewards:rewards.results.map(r=>({...r,status:r.status==='available'&&r.expires_on&&r.expires_on<today?'expired':r.status}))};
}
