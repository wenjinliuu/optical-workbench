import * as P from './procurement.mjs';
import * as R from './purchase-receiving.mjs';
import * as E from './purchase-extra-returns.mjs';
export function seedDemoExtraReturns(db){
 const result={plans:0,handed:0,received:0};if(db.prepare('SELECT 1 FROM purchase_extra_return_plans').get())return result;
 const store=db.prepare("SELECT store_id FROM users WHERE id='demo-manager' AND role='manager' AND active=1").get()?.store_id;
 if(!store||db.prepare("SELECT 1 FROM user_security WHERE user_id='demo-manager' AND must_change_password=1").get()||!db.prepare("SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id='demo-front' AND u.store_id=? AND u.role='reception' AND u.active=1 AND coalesce(s.must_change_password,0)=0").get(store))return result;
 const product=db.prepare("SELECT product_id,version FROM retail_product_versions WHERE store_id=? AND category<>'service' AND status='active' AND version=(SELECT max(version) FROM retail_product_versions p WHERE p.product_id=retail_product_versions.product_id) ORDER BY product_id LIMIT 1").get(store);if(!product)return result;
 const at=new Date().toISOString(),n={note:'虚构超收未匹配原件办理',reason:'分阶段演示',next_step:'依实际仓库来源和后续商业决定办理，不推定费用责任'},supplier='demo-extra-supplier';
 db.exec('SAVEPOINT demo_extra_returns');try{
 P.createSupplier(db,store,{code:'DEMO-EXTRA-SUPPLIER',name:'超收退回演示供应商（虚构）',contact_label:null,contact_method:null,address_note:null,scope_note:'仅虚构目录；真实资质合同待核验',settlement_note:null,source_note:'虚构来源',source_reference:'DEMO-ONLY',status:'active',reason:n.reason},'demo-manager',at,supplier);
 for(const [stage,title] of [['draft','超收退回安排草稿（虚构）'],['approved','超收退回已批准、尚未交出（虚构）'],['partial','超收部分已交出、供应方待收（虚构）'],['handed','超收安排全部交出、供应方待收（虚构）'],['received','超收供应方已分批收件（虚构）'],['partial_stop','超收部分交出、剩余安排停止（虚构）'],['rejected','超收商业安排已驳回（虚构）']]){
 const purchase='demo-extra-'+stage+'-purchase',receipt='demo-extra-'+stage+'-receipt',plan='demo-extra-'+stage+'-plan';
 P.createPurchase(db,store,{supplier_id:supplier,supplier_version:1,title,purpose_note:'虚构超收独立来源，不记入SKU库存',source_note:'虚构原采购数量价格',source_reference:'DEMO-EXTRA-'+stage,expected_date:null,items:[{product_id:product.product_id,product_version:product.version,quantity:1,unit_price_cents:100,note:null}],...n},'demo-front',at,purchase);
 for(const action of ['submit','approve','order'])P.purchaseEvent(db,purchase,{action,decision_basis:'虚构人工订货商业决定与实际来源',ordered_at:at,order_reference:'DEMO-EXTRA-'+stage,...n},action==='approve'?'demo-manager':'demo-front',at);
 const line=R.purchaseReceiptLines(db,purchase)[0];R.createReceipt(db,store,{order_event_id:line.order_event_id,position:1,received_quantity:4,bound_quantity:1,received_at:at,receiver_label:'虚构实际收货人',delivery_reference:null,source_line_reference:null,receipt_source_note:'虚构到货4件，原采购匹配1件，超收3件尚未入账',lot_status:'unknown',lot_code:null,expiry_status:'unknown',expiry_date:null,location_status:'unknown',location_note:null,manufacturer_note:null,source_note:'未知批号效期仓位保留，人工实际来源仅作虚构演示',source_reference:'DEMO-EXTRA-'+stage,...n},'demo-front',at,receipt);
 const s=E.extraReturnSource(db,receipt);E.createExtraReturn(db,store,{receipt_id:receipt,receipt_version_id:s.receipt_version.id,quantity:3,custody_confirmed_at:at,custody_source:'虚构已发生人工核对原超收箱身份、3件数量与独立保管处，不能从原收货量推定今天仍在库',source_note:'虚构原超收未入账来源',return_basis:'虚构人工退回决定，真实合同政策待核验',destination_note:'虚构原供应方接收处',contact_note:null,source_reference:'DEMO-EXTRA-ARRANGEMENT-'+stage,...n},'demo-manager',at,plan);result.plans++;
 if(stage==='draft')continue;E.extraReturnEvent(db,plan,{action:'submit',decision_basis:'虚构商业审核提交依据',...n},'demo-manager',at);E.extraReturnEvent(db,plan,{action:stage==='rejected'?'reject':'approve',decision_basis:'虚构明确人工商业决定，不是默认退回规则',...n},'demo-manager',at);
 if(['approved','rejected'].includes(stage))continue;const quantity=['partial','partial_stop'].includes(stage)?1:3,handoff='demo-extra-'+stage+'-handoff';E.extraReturnHandoff(db,plan,{id:handoff,quantity,handed_at:at,collector_label:'虚构实际接收人',destination_note:'虚构原供应方实际接收处',external_reference:null,source_identity:null,source_note:'虚构已发生超收未入账原件交出，已匹配商品账不变化',...n},'demo-manager',at);result.handed+=quantity;
 if(stage==='partial_stop')E.extraReturnEvent(db,plan,{action:'stop_remaining',decision_basis:'虚构明确停止剩余安排，原实际交出保留',...n},'demo-manager',at);
 if(stage==='received')for(const quantity of [1,2]){E.extraSupplierReceipt(db,handoff,{quantity,received_at:at,receiver_label:'虚构供应方实际收件人',external_reference:null,source_identity:null,source_note:'虚构已发生独立超收分批收件，不扣库存、不代表退款',...n},'demo-front',at);result.received+=quantity;}
 }
 db.exec('RELEASE demo_extra_returns');return result;
 }catch(e){db.exec('ROLLBACK TO demo_extra_returns;RELEASE demo_extra_returns');throw e;}
}
