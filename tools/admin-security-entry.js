import QRCode from 'qrcode';
const $=selector=>document.querySelector(selector);
async function api(action,body){
 const response=await fetch('/api/admin/mfa/'+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Não foi possível concluir.');return data;
}
async function submit(form,task){const button=form.querySelector('button');button.disabled=true;$('#message').textContent='';try{await task()}catch(error){$('#message').textContent=error.message}finally{button.disabled=false}}
$('#setup').addEventListener('submit',event=>{event.preventDefault();void submit(event.currentTarget,async()=>{
 const input=$('[name=password]');const password=input.value;input.value='';
 const data=await api('setup',{password});
 await QRCode.toCanvas($('#qr'),data.uri,{width:280,margin:4,errorCorrectionLevel:'M'});
 $('#secret').textContent=data.secret;$('#recovery').textContent=data.recovery_codes.join('\n');
 $('#enrollment').hidden=false;$('#setup').hidden=true;$('#status').textContent='Ainda não ativado. Conclua as etapas abaixo.';
})});
$('#confirm').addEventListener('submit',event=>{event.preventDefault();void submit(event.currentTarget,async()=>{
 await api('confirm',{code:$('[name=code]').value});
 $('#enrollment').hidden=true;$('#secret').textContent='';$('#recovery').textContent='';$('#qr').getContext('2d').clearRect(0,0,$('#qr').width,$('#qr').height);
 $('#status').textContent='Verificação em duas etapas ativada! Aguarde o próximo código do aplicativo e entre novamente.';$('#login').hidden=false;
})});
api('status').then(data=>{if(data.enabled){$('#status').textContent='A verificação em duas etapas está ativa para esta conta.'}else if(!data.configured){$('#status').textContent='A configuração do servidor ainda está pendente.'}else{$('#status').textContent='Proteja o acesso à sua conta administrativa.';$('#setup').hidden=false}}).catch(()=>{$('#status').textContent='Entre no painel com sua conta administrativa para configurar.';$('#login').hidden=false});
