// Escape a value for safe interpolation into innerHTML (text or quoted attribute).
export function escapeHtml(v){
if(v===null||v===undefined)return'';
return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
