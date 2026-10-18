// Only remove source proofs and display page sizes. Meaningful filters and page
// offsets retain distinct keys; an unrecorded filter must never show other data.
export function snapshotKey(input){
 const url=new URL(input,'https://static-preview.invalid');
 const pairs=[...url.searchParams].filter(([k,v])=>!k.startsWith('expected_')&&!/(^|_)limit$/.test(k)&&v!==''&&!(k==='offset'&&v==='0'));
 pairs.sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));const query=new URLSearchParams(pairs).toString();return url.pathname+(query?'?'+query:'');
}
