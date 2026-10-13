/* World Alive embed loader. Usage:
   <script src="https://theworldalive.com/embed/embed.js" data-type="country" data-iso="TUR" data-theme="dark" data-size="card"></script>
   Replaces itself with a responsive iframe. Or skip this file and paste the <iframe> from https://theworldalive.com/embed/ */
(function(){var s=document.currentScript;if(!s)return;var d=s.dataset,q=[];['type','iso','city','vs','theme','size'].forEach(function(k){if(d[k])q.push(k+'='+encodeURIComponent(d[k]));});
var h=d.size==='bar'?64:d.type==='compare'?150:d.size==='tile'?170:150;var f=document.createElement('iframe');f.src=(s.src.replace(/embed\.js.*$/,'widget.html'))+'?'+q.join('&');
f.title='World Alive live population widget';f.loading='lazy';f.style.cssText='width:100%;max-width:'+(d.width||'520px')+';height:'+h+'px;border:0;overflow:hidden;display:block';f.setAttribute('scrolling','no');s.parentNode.replaceChild(f,s);})();
