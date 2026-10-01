(function(){
  const style=document.createElement('style');
  style.textContent='.product-image-preview{display:flex;flex-wrap:wrap;gap:10px}.product-image-preview .selected-image{position:relative;width:96px}.product-image-preview img{display:block;width:96px;height:96px;object-fit:cover}.product-image-preview .remove-selected-image{position:absolute;top:4px;right:4px;width:24px;height:24px;border:0;border-radius:50%;background:#111d;color:#fff;font-size:17px;line-height:1;cursor:pointer}.product-image-preview .remove-selected-image:hover{background:#a33}.product-image-preview span{flex-basis:100%}';
  document.head.appendChild(style);

  bindProductImagePreview=function(){
    const input=document.querySelector('input[name="image_file"]'),preview=document.querySelector('.product-image-preview');
    if(!input||!preview)return;
    let existingImage=preview.querySelector('img')?.getAttribute('src')||'';
    let files=[];
    input.multiple=true;
    input.dataset.append=existingImage?'1':'0';
    const hint=input.closest('.product-image-picker')?.querySelector('small');
    if(hint)hint.textContent='Escolha uma ou várias fotos. Você pode adicionar mais depois ou remover antes de salvar.';

    const syncInput=()=>{
      const transfer=new DataTransfer();
      files.forEach(file=>transfer.items.add(file));
      input.files=transfer.files;
    };
    const render=()=>{
      if(!files.length){
        if(existingImage){preview.innerHTML=`<div class="selected-image"><img src="${existingImage}" alt="Imagem atual do produto"><button class="remove-selected-image" type="button" data-remove-existing-image aria-label="Remover imagem atual">×</button></div><span>Imagem atual. Clique no × para removê-la ou escolha novas fotos para adicionar.</span>`;preview.hidden=false;preview.querySelector('[data-remove-existing-image]').onclick=()=>{existingImage='';input.dataset.append='0';const url=document.querySelector('input[name="image_url"]');if(url)url.value='';render()};}
        else preview.hidden=true;
        return;
      }
      preview.innerHTML=files.map((file,index)=>`<div class="selected-image"><img src="${URL.createObjectURL(file)}" alt="Prévia de ${file.name}"><button class="remove-selected-image" type="button" data-remove-selected-image="${index}" aria-label="Remover ${file.name}">×</button></div>`).join('')+`<span>${files.length} foto${files.length>1?'s':''} pronta${files.length>1?'s':''} para adicionar. Clique no × para remover.</span>`;
      preview.hidden=false;
      preview.querySelectorAll('[data-remove-selected-image]').forEach(button=>button.onclick=()=>{files.splice(Number(button.dataset.removeSelectedImage),1);syncInput();render()});
    };
    input.onchange=()=>{
      const added=Array.from(input.files||[]);
      added.forEach(file=>{if(!files.some(current=>current.name===file.name&&current.size===file.size&&current.lastModified===file.lastModified))files.push(file)});
      syncInput();render();
    };
    render();
  };

  uploadProductFile=async function(productId){
    const input=document.querySelector('input[name="image_file"]');
    const files=Array.from(input?.files||[]);
    let result=null;
    for(let index=0;index<files.length;index++){
      const form=new FormData();
      form.append('image',files[index]);
      if(index||input?.dataset.append==='1')form.append('append','1');
      const response=await fetch('/api/admin/products/'+productId+'/image',{method:'POST',credentials:'same-origin',body:form});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error?.message||'Não foi possível enviar a imagem.');
      result=data;
    }
    return result;
  };
})();
